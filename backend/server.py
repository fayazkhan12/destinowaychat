"""DestinoWay — Premium multilingual travel agent backend.

Clean service-shaped API so that live Akbar/Travelportal credentials can be
dropped into env without touching any code. Email+Password + Emergent Google
auth, Razorpay payments, mock inventory with pluggable hotel adapter, and
multilingual Gemini-powered concierge SSE chat.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import bcrypt
import httpx
import jwt
import razorpay
from dotenv import load_dotenv
from google import genai
from google.genai import types as genai_types
from fastapi import APIRouter, Cookie, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------- infra ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ.get("JWT_SECRET", "destinoway-dev-secret")
JWT_ALG = "HS256"
JWT_TTL = timedelta(days=7)
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
razorpay_client: Optional[razorpay.Client] = None
if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
    razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
# fallback chain if primary model is overloaded / rate-limited (ordered: fast -> smaller)
_fb = [
    GEMINI_MODEL,
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
]
GEMINI_FALLBACK_MODELS: List[str] = []
for _m in _fb:
    if _m and _m not in GEMINI_FALLBACK_MODELS:
        GEMINI_FALLBACK_MODELS.append(_m)
genai_client: Optional[genai.Client] = None
if GEMINI_API_KEY:
    genai_client = genai.Client(api_key=GEMINI_API_KEY)

AKBAR_HOST = os.environ.get("AKBAR_API_HOST", "").rstrip("/")
BENZY_SIG_URL = os.environ.get("AKBAR_SIGNATURE_URL", "").rstrip("/")
BENZY_HOTEL_URL = os.environ.get("AKBAR_HOTEL_API_URL", "").rstrip("/")
BENZY_MERCHANT_ID = os.environ.get("AKBAR_MERCHANT_ID", "")
BENZY_API_KEY = os.environ.get("AKBAR_API_KEY", "")
BENZY_CLIENT_ID = os.environ.get("AKBAR_CLIENT_ID", "")
BENZY_PASSWORD = os.environ.get("AKBAR_PASSWORD", "")
BENZY_BROWSER_KEY = os.environ.get("AKBAR_BROWSER_KEY", "")
BENZY_KEY = os.environ.get("AKBAR_KEY", "")
BENZY_AGENT_CODE = os.environ.get("AKBAR_AGENT_CODE", "")

logger = logging.getLogger("destinoway")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

app = FastAPI(title="DestinoWay API", version="2.0.0")
api = APIRouter(prefix="/api")


# ---------- models ----------
class SignupIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class SearchRequest(BaseModel):
    service: Literal["flights", "hotels", "buses", "cabs"]
    origin: str = "New Delhi"
    destination: str = "Goa"
    destination_id: Optional[str] = None  # Akbar supplierLocationId when picked from autocomplete
    start_date: str = "2026-05-18"
    end_date: str = "2026-05-22"
    travellers: int = 2
    rooms: int = 1
    budget: Optional[float] = None
    sort: Literal["recommended", "price", "duration", "rating"] = "recommended"
    nationality: str = "IN"


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    language: str = "auto"
    history: List[Dict[str, str]] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)


class TripSaveIn(BaseModel):
    title: str = "My DestinoWay trip"
    items: List[Dict[str, Any]] = Field(default_factory=list)
    origin: str = ""
    destination: str = ""
    dates: str = ""


class BookingIn(BaseModel):
    item: Dict[str, Any]
    traveller: Dict[str, Any]
    amount_rupees: int = Field(gt=0)
    service: str


class VerifyIn(BaseModel):
    booking_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


# ---------- auth helpers ----------
def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _check(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def _make_jwt(user_id: str) -> str:
    payload = {"sub": user_id, "iat": datetime.now(timezone.utc), "exp": datetime.now(timezone.utc) + JWT_TTL}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def _decode_jwt(token: str) -> Optional[str]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])["sub"]
    except Exception:
        return None


async def _user_from_request(request: Request) -> Optional[Dict[str, Any]]:
    # 1) session cookie (Emergent Google)
    cookie = request.cookies.get("session_token")
    if cookie:
        session = await db.user_sessions.find_one({"session_token": cookie}, {"_id": 0})
        if session:
            expires_at = session.get("expires_at")
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at and expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if not expires_at or expires_at >= datetime.now(timezone.utc):
                user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})
                if user:
                    return user
    # 2) JWT bearer (email/password)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        user_id = _decode_jwt(auth[7:])
        if user_id:
            user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
            if user:
                return user
    return None


async def current_user(request: Request) -> Dict[str, Any]:
    user = await _user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def optional_user(request: Request) -> Optional[Dict[str, Any]]:
    return await _user_from_request(request)


# ---------- mock inventory (replace with Akbar/Travelportal adapter) ----------
def _seed(text: str) -> int:
    return int(hashlib.sha1(text.encode()).hexdigest()[:8], 16)


def _hotel_image(seed: int, i: int) -> str:
    pool = [
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=900&q=80",
    ]
    return pool[(seed + i) % len(pool)]


def _mock_results(req: SearchRequest) -> List[Dict[str, Any]]:
    city = req.destination.title()
    origin = req.origin.title()
    seed = _seed(f"{req.service}:{origin}:{city}:{req.start_date}")
    if req.service == "flights":
        names = [("IndiGo", "6E"), ("Air India", "AI"), ("Vistara", "UK"), ("SpiceJet", "SG"), ("Emirates", "EK")]
        return [{
            "id": f"fl-{seed}-{i}", "type": "flight", "provider": "DestinoWay Marketplace", "mode": "DEMO",
            "title": f"{code} {100 + i * 47}", "brand": brand, "origin": origin, "destination": city,
            "departure": f"{req.start_date}T{6 + i * 2:02d}:20:00", "arrival": f"{req.start_date}T{9 + i * 2:02d}:05:00",
            "duration": f"{3 + i}h 45m", "stops": 0 if i < 2 else 1,
            "price": 4290 + ((seed >> i) % 7) * 780, "currency": "INR",
            "cabin": "Economy", "baggage": "15 kg + 7 kg cabin",
            "image": f"https://images.unsplash.com/photo-{['1569154941061-e231b4725ef1','1436491865332-7a61a109cc05','1540962351504-03099e0a754b','1483540716030-f99f85b19dcd','1540339832862-474599807836'][i % 5]}?auto=format&fit=crop&w=900&q=80",
            "meta": ["Cabin bag", "Free changes" if i % 2 == 0 else "15 kg check-in"],
        } for i, (brand, code) in enumerate(names)]
    if req.service == "hotels":
        names = ["The Palm Grove", "Casa Amora Boutique", "The Leela Palace", "Coastal House", "Serene Horizon Resort", "Taj Riverside"]
        locations = ["Candolim Beach", "Fontainhas Panjim", "Baga Riviera", "Dona Paula Bay", "Palolem Beach", "Mandrem Villas"]
        amen = [["Rooftop pool", "Breakfast", "Spa"], ["Beachfront", "Yoga studio", "Bar"], ["Ocean view", "Butler", "Private pool"], ["Garden suite", "Cocktail bar"], ["Infinity pool", "Fitness"], ["Riverside dining", "Spa"]]
        return [{
            "id": f"ho-{seed}-{i}", "type": "hotel", "provider": "DestinoWay Marketplace", "mode": "DEMO",
            "title": names[i], "brand": f"{city} · {5 - i % 2} star", "origin": city, "destination": city,
            "rating": round(4.9 - i * 0.1, 1), "location": locations[i],
            "price": 5800 + ((seed >> i) % 6) * 1100, "currency": "INR",
            "image": _hotel_image(seed, i), "nights": max(1, (datetime.fromisoformat(req.end_date) - datetime.fromisoformat(req.start_date)).days),
            "amenities": amen[i], "meta": ["Breakfast included", "Free cancellation", "Pay at hotel"],
        } for i in range(6)]
    if req.service == "buses":
        names = ["IntrCity SmartBus", "Zingbus Executive", "Volvo Multi-Axle", "Neeta Travels", "VRL Luxury Sleeper"]
        return [{
            "id": f"bu-{seed}-{i}", "type": "bus", "provider": "DestinoWay Marketplace", "mode": "DEMO",
            "title": names[i], "brand": "AC sleeper · live tracking", "origin": origin, "destination": city,
            "departure": f"{req.start_date}T{18 + i:02d}:00:00", "arrival": f"{req.start_date}T{7 + i:02d}:30:00",
            "duration": f"{11 + i}h 30m", "stops": 2, "price": 980 + i * 260, "currency": "INR",
            "image": "https://images.unsplash.com/photo-1612144431180-2d672779556c?auto=format&fit=crop&w=900&q=80",
            "meta": ["Charging point", "Blanket included", "Live tracking"],
        } for i in range(5)]
    names = ["Goa Airport Transfer", "BluSmart Executive", "Savaari Outstation", "KTC Premium Cab", "Luxe Chauffeur"]
    return [{
        "id": f"ca-{seed}-{i}", "type": "cab", "provider": "DestinoWay Marketplace", "mode": "DEMO",
        "title": names[i], "brand": "Sedan · meet & greet", "origin": origin, "destination": city,
        "duration": f"{35 + i * 8} min", "price": 899 + i * 340, "currency": "INR",
        "image": "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=900&q=80",
        "meta": ["Toll included", "Free wait 45 min", "Child seat on request"],
    } for i in range(5)]


# ---------- Akbar destination autocomplete ----------
async def _akbar_destinations(search: str) -> List[Dict[str, Any]]:
    if not AKBAR_HOST or not search.strip():
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client_http:
            r = await client_http.post(
                f"{AKBAR_HOST}/api/v1/destination/search",
                json={"searchInput": search},
                headers={"Content-Type": "application/json"},
            )
            if r.status_code != 200:
                return []
            payload = r.json()
            items = payload.get("data", []) if payload.get("success") else []
            return [{
                "id": d.get("id"),
                "label": d.get("displayName"),
                "type": d.get("type"),
                "city": d.get("city"),
                "state": d.get("state"),
                "country": d.get("country"),
                "code": d.get("code"),
                "coordinates": d.get("coordinates"),
                "supplier": (d.get("supplierData") or {}).get("supplier"),
                "supplierLocationId": (d.get("supplierData") or {}).get("supplierLocationId"),
            } for d in items[:12]]
    except Exception as exc:
        logger.warning("Akbar destination search failed: %s", exc)
        return []


@api.get("/destinations/autocomplete")
async def destinations_autocomplete(q: str):
    results = await _akbar_destinations(q)
    return {"success": True, "mode": "LIVE" if (AKBAR_HOST and results) else "DEMO", "results": results}


# ---------- Akbar/Benzy hotel search (plug & play) ----------
async def _benzy_signature(client_http: httpx.AsyncClient) -> Optional[str]:
    """Fetch a short-lived signature/auth token from Benzy."""
    if not (BENZY_SIG_URL and BENZY_MERCHANT_ID and BENZY_API_KEY and BENZY_CLIENT_ID and BENZY_PASSWORD):
        return None
    try:
        r = await client_http.get(
            BENZY_SIG_URL,
            headers={
                "merchantId": BENZY_MERCHANT_ID,
                "apiKey": BENZY_API_KEY,
                "clientId": BENZY_CLIENT_ID,
                "password": BENZY_PASSWORD,
                "browserKey": BENZY_BROWSER_KEY,
            },
            timeout=10,
        )
        if r.status_code != 200:
            logger.warning("Benzy signature non-200: %s %s", r.status_code, r.text[:200])
            return None
        data = r.json()
        return data.get("signature") or data.get("token") or data.get("Authorization") or data.get("data", {}).get("signature")
    except Exception as exc:
        logger.warning("Benzy signature fetch failed: %s", exc)
        return None


async def _akbar_hotels(req: SearchRequest) -> Optional[List[Dict[str, Any]]]:
    """Live hotel search via Benzy Travelportal. Returns None if any step fails (caller falls back to mock)."""
    if not (BENZY_HOTEL_URL and BENZY_MERCHANT_ID and BENZY_API_KEY):
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as client_http:
            signature = await _benzy_signature(client_http)
            if not signature:
                return None
            location_id = req.destination_id or ""
            if not location_id:
                dests = await _akbar_destinations(req.destination)
                if dests:
                    location_id = dests[0].get("supplierLocationId") or dests[0].get("id") or ""
            if not location_id:
                return None
            payload = {
                "locationId": location_id,
                "currency": "INR", "culture": "en-US",
                "checkIn": req.start_date.replace("-", "/"),
                "checkOut": req.end_date.replace("-", "/"),
                "rooms": [{"adults": str(req.travellers), "children": "0", "childAges": []}],
                "agentCode": BENZY_AGENT_CODE,
                "nationality": req.nationality,
                "countryOfResidence": req.nationality,
                "channelId": "b2bIndiaDeals", "affiliateRegion": "B2B_India",
                "companyId": "1", "gstPercentage": 0, "tdsPercentage": 0,
            }
            auth_headers = {
                "Authorization": signature,
                "merchantId": BENZY_MERCHANT_ID,
                "apiKey": BENZY_API_KEY,
                "clientId": BENZY_CLIENT_ID,
                "browserKey": BENZY_BROWSER_KEY,
                "Content-Type": "application/json",
            }
            init = await client_http.post(f"{BENZY_HOTEL_URL}/api/hotels/search/init", json=payload, headers=auth_headers)
            if init.status_code != 200:
                logger.warning("Benzy init non-200: %s %s", init.status_code, init.text[:200])
                return None
            data = init.json()
            search_id = data.get("searchId") or data.get("data", {}).get("searchId")
            tracing = data.get("searchTracingKey") or data.get("data", {}).get("searchTracingKey")
            if not search_id:
                return None
            result_headers = {**auth_headers, "search-tracing-key": tracing or "", "user-session-key": BENZY_KEY}
            # Poll result up to 2 times (results are async)
            hotels_raw = []
            for _ in range(2):
                results = await client_http.get(
                    f"{BENZY_HOTEL_URL}/api/hotels/search/result/{search_id}/content?limit=25&offset=-1&filterdata=false",
                    headers=result_headers,
                )
                if results.status_code == 200:
                    body = results.json()
                    hotels_raw = body.get("hotels") or body.get("data", {}).get("hotels") or []
                    if hotels_raw:
                        break
                await asyncio.sleep(1.5)
            if not hotels_raw:
                return None
            return [{
                "id": f"ak-{h.get('id') or h.get('hotelId')}",
                "type": "hotel", "provider": "Akbar / Benzy Travelportal", "mode": "LIVE",
                "title": h.get("name", "Hotel"),
                "brand": f"{req.destination} · {h.get('rating', h.get('starRating', 4))} star",
                "origin": req.destination, "destination": req.destination,
                "rating": float(h.get("rating", h.get("starRating", 4.3)) or 4.3),
                "location": h.get("address", h.get("location", "")),
                "price": float(h.get("minPrice", h.get("totalPrice", h.get("price", 5000)))),
                "currency": "INR",
                "image": (h.get("images") or [{"url": _hotel_image(1, 0)}])[0].get("url", _hotel_image(1, 0)) if h.get("images") else _hotel_image(1, 0),
                "amenities": (h.get("amenities") or h.get("facilities") or [])[:5],
                "meta": ["Live inventory", "Instant confirmation"],
                "akbar_ref": {"searchId": search_id, "hotelId": h.get("id") or h.get("hotelId"), "tracingKey": tracing},
            } for h in hotels_raw[:12]]
    except Exception as exc:
        logger.warning("Benzy hotels adapter error: %s", exc)
        return None


# ---------- routes: health & auth ----------
@api.get("/")
async def root():
    return {"message": "DestinoWay API", "version": "2.0", "razorpay_configured": bool(razorpay_client)}


@api.post("/auth/signup")
async def signup(body: SignupIn):
    existing = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id, "email": body.email.lower(), "name": body.name,
        "picture": None, "password_hash": _hash(body.password), "provider": "password",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return {"token": _make_jwt(user_id), "user": {"user_id": user_id, "email": doc["email"], "name": doc["name"]}}


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not user.get("password_hash") or not _check(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": _make_jwt(user["user_id"]), "user": {"user_id": user["user_id"], "email": user["email"], "name": user["name"], "picture": user.get("picture")}}


@api.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange Emergent OAuth session_id (sent via X-Session-ID header) for a session cookie."""
    session_id = request.headers.get("X-Session-ID") or request.headers.get("x-session-id")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing X-Session-ID header")
    try:
        async with httpx.AsyncClient(timeout=15) as client_http:
            r = await client_http.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id},
            )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Session exchange failed")
        data = r.json()
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Google session exchange error: %s", exc)
        raise HTTPException(status_code=502, detail="Could not reach auth provider") from exc

    email = (data.get("email") or "").lower()
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data["session_token"]

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "provider": "google", "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(dict(user))
    else:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"name": name, "picture": picture}})

    await db.user_sessions.insert_one({
        "user_id": user["user_id"], "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    response.set_cookie(
        key="session_token", value=session_token, max_age=7 * 24 * 60 * 60,
        httponly=True, secure=True, samesite="none", path="/",
    )
    return {"user": {"user_id": user["user_id"], "email": email, "name": name, "picture": picture}}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user


@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    cookie = request.cookies.get("session_token")
    if cookie:
        await db.user_sessions.delete_one({"session_token": cookie})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"ok": True}


# ---------- travel search + detail ----------
@api.post("/travel/search")
async def travel_search(req: SearchRequest):
    results: List[Dict[str, Any]] = []
    mode = "DEMO"
    if req.service == "hotels":
        live = await _akbar_hotels(req)
        if live:
            results = live
            mode = "LIVE"
    if not results:
        results = _mock_results(req)
    if req.budget is not None:
        trimmed = [r for r in results if r["price"] <= req.budget]
        results = trimmed or results
    if req.sort == "price":
        results.sort(key=lambda r: r["price"])
    elif req.sort == "rating" and req.service == "hotels":
        results.sort(key=lambda r: -r.get("rating", 0))
    return {
        "status": "success", "mode": mode, "service": req.service,
        "results": results, "searched_at": datetime.now(timezone.utc).isoformat(),
    }


@api.get("/travel/detail/{item_id}")
async def travel_detail(item_id: str):
    # Lookup via last saved search cache; fall back to mock stub.
    cached = await db.search_items.find_one({"id": item_id}, {"_id": 0})
    if cached:
        return cached
    raise HTTPException(status_code=404, detail="Item not found. Please search again.")


@api.post("/travel/cache")
async def cache_items(items: List[Dict[str, Any]]):
    """Frontend posts results so detail pages can be opened by id without re-searching."""
    for it in items:
        if "id" in it:
            await db.search_items.update_one({"id": it["id"]}, {"$set": it}, upsert=True)
    return {"ok": True, "count": len(items)}


# ---------- featured content ----------
@api.get("/featured/destinations")
async def featured():
    return {
        "destinations": [
            {"city": "Goa", "country": "India", "tag": "Beaches", "image": "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=900&q=80", "from_price": 4299},
            {"city": "Udaipur", "country": "Rajasthan", "tag": "Heritage", "image": "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=900&q=80", "from_price": 5899},
            {"city": "Male", "country": "Maldives", "tag": "Island luxury", "image": "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=900&q=80", "from_price": 28999},
            {"city": "Dubai", "country": "UAE", "tag": "Skyline", "image": "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=900&q=80", "from_price": 18499},
            {"city": "Manali", "country": "Himachal", "tag": "Mountain", "image": "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=900&q=80", "from_price": 3899},
            {"city": "Bali", "country": "Indonesia", "tag": "Tropical", "image": "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=900&q=80", "from_price": 24999},
        ],
        "collections": [
            {"title": "Honeymoon in Himalayas", "image": "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=900&q=80", "nights": 5, "price": 42000},
            {"title": "Rajasthan Palace Trail", "image": "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=900&q=80", "nights": 7, "price": 68000},
            {"title": "Maldives Overwater Villas", "image": "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=900&q=80", "nights": 4, "price": 155000},
        ],
    }


# ---------- trips (saved itineraries) ----------
@api.post("/trips")
async def save_trip(body: TripSaveIn, user=Depends(optional_user)):
    share_id = uuid.uuid4().hex[:10]
    doc = {
        **body.model_dump(), "share_id": share_id,
        "user_id": user["user_id"] if user else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.saved_trips.insert_one(dict(doc))
    return {"status": "success", "share_id": share_id, "trip": doc}


@api.get("/trips/{share_id}")
async def get_trip(share_id: str):
    trip = await db.saved_trips.find_one({"share_id": share_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@api.get("/me/trips")
async def my_trips(user=Depends(current_user)):
    trips = await db.saved_trips.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"trips": trips}


# ---------- bookings + payments ----------
@api.post("/bookings")
async def create_booking(body: BookingIn, user=Depends(optional_user)):
    booking_id = f"DW{uuid.uuid4().hex[:10].upper()}"
    doc = {
        "booking_id": booking_id,
        "user_id": user["user_id"] if user else None,
        "service": body.service, "item": body.item, "traveller": body.traveller,
        "amount_rupees": body.amount_rupees, "currency": "INR",
        "status": "pending_payment",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    razorpay_order = None
    if razorpay_client:
        try:
            order = razorpay_client.order.create({
                "amount": body.amount_rupees * 100,
                "currency": "INR",
                "receipt": booking_id,
                "notes": {"booking_id": booking_id, "service": body.service},
                "payment_capture": 1,
            })
            doc["razorpay_order_id"] = order["id"]
            razorpay_order = order
        except Exception as exc:
            logger.warning("Razorpay order create failed: %s", exc)
    await db.bookings.insert_one(dict(doc))
    doc.pop("_id", None)
    return {
        "booking_id": booking_id,
        "amount_rupees": body.amount_rupees,
        "razorpay_order_id": razorpay_order["id"] if razorpay_order else None,
        "razorpay_key_id": RAZORPAY_KEY_ID if razorpay_order else None,
        "mode": "LIVE" if razorpay_order else "DEMO",
    }


@api.post("/bookings/verify")
async def verify_booking(body: VerifyIn):
    booking = await db.bookings.find_one({"booking_id": body.booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if RAZORPAY_KEY_SECRET:
        message = f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode()
        expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), message, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, body.razorpay_signature):
            raise HTTPException(status_code=400, detail="Invalid payment signature")
    await db.bookings.update_one(
        {"booking_id": body.booking_id},
        {"$set": {
            "razorpay_payment_id": body.razorpay_payment_id,
            "razorpay_signature": body.razorpay_signature,
            "status": "confirmed",
            "confirmed_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"status": "confirmed", "booking_id": body.booking_id}


@api.post("/bookings/demo-confirm")
async def demo_confirm(body: Dict[str, str]):
    """Fallback when Razorpay keys aren't configured — marks booking as confirmed in DEMO mode."""
    booking_id = body.get("booking_id")
    if not booking_id:
        raise HTTPException(status_code=400, detail="booking_id required")
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$set": {"status": "confirmed_demo", "confirmed_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"status": "confirmed_demo", "booking_id": booking_id}


@api.get("/bookings/{booking_id}")
async def get_booking(booking_id: str):
    booking = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


@api.get("/me/bookings")
async def my_bookings(user=Depends(current_user)):
    bookings = await db.bookings.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"bookings": bookings}


@api.post("/payments/webhook")
async def payments_webhook(request: Request):
    raw = await request.body()
    sig = request.headers.get("x-razorpay-signature", "")
    if not RAZORPAY_WEBHOOK_SECRET:
        return {"ok": True, "note": "webhook secret not configured"}
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=400, detail="Invalid signature")
    event = json.loads(raw.decode())
    event_id = event.get("id")
    if event_id:
        try:
            await db.webhook_events.insert_one({"event_id": event_id, "received_at": datetime.now(timezone.utc).isoformat()})
        except Exception:
            return {"ok": True, "duplicate": True}
    payment = event.get("payload", {}).get("payment", {}).get("entity", {})
    order_id = payment.get("order_id")
    name = event.get("event")
    if name == "payment.captured" and order_id:
        await db.bookings.update_one({"razorpay_order_id": order_id}, {"$set": {"status": "paid", "captured_at": datetime.now(timezone.utc).isoformat()}})
    elif name == "payment.failed" and order_id:
        await db.bookings.update_one({"razorpay_order_id": order_id, "status": {"$nin": ["paid", "confirmed"]}}, {"$set": {"status": "payment_failed"}})
    return {"ok": True}


# ---------- chat (multilingual, direct Google Gemini) ----------
SYSTEM_PROMPT = (
    "You are DestinoWay — a warm, concise multilingual Indian travel agent who speaks like a real human friend on a phone call. You are a CHAT AGENT, not a brochure.\n\n"
    "LANGUAGE: Auto-detect user's language (Hindi, Hinglish, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, English, Urdu, Arabic etc.) and ALWAYS reply in the SAME language and script. Hinglish user = Hinglish reply.\n\n"
    "STYLE RULES — STRICT:\n"
    "1. Every reply MAX 2 short sentences. Voice-friendly, conversational. No markdown, no bullet lists, no emojis dump, no ** bold **.\n"
    "2. Ask ONLY ONE question at a time. Flow: pick service (flight/hotel/bus/cab) → destination → origin → dates → travellers → confirm. Never jump ahead.\n"
    "3. Talk like a human friend — contractions, light interjections (waah, bilkul, nice, got it, haan ji). Never sound robotic or like a travel brochure.\n"
    "4. Do NOT dump prices, itineraries, or options unprompted. Wait for the user to be ready, then keep it tight.\n"
    "5. Never claim a booking is confirmed without a payment reference.\n\n"
    "SEARCH TRIGGER — IMPORTANT:\n"
    "Once you have ALL FIVE pieces (service, destination, origin, start_date, end_date, travellers), END your reply with EXACTLY this JSON block on a new line and NOTHING after it:\n"
    "<search>{\"service\":\"flights|hotels|buses|cabs\",\"origin\":\"City\",\"destination\":\"City\",\"start_date\":\"YYYY-MM-DD\",\"end_date\":\"YYYY-MM-DD\",\"travellers\":2}</search>\n"
    "Before the block, write ONE short line like 'Perfect, abhi options dikhata hoon.' or 'Great, let me pull up some options.' The UI will render live cards from the block.\n"
    "Do NOT emit the block until you have all five pieces. For cabs, end_date can equal start_date.\n\n"
    "Example GOOD when user says 'Jaipur jaana hai': 'Jaipur — Pink City! Pehle ek baat batao, aap kahaan se chalenge?' (one short line, one question).\n"
    "Example BAD: Dumping flight prices, hotel lists, itinerary, and 4 questions at once."
)


@api.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    async def generator():
        reply = ""
        if not genai_client:
            reply = "AI concierge key configured nahi hai. Admin se kaho GEMINI_API_KEY /app/backend/.env me daal de."
            yield f"data: {json.dumps({'type': 'token', 'text': reply}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
            return

        # Build Gemini contents from conversation history + current message
        contents = []
        for h in (req.history or [])[-10:]:
            text = (h.get("text") or "").strip()
            if not text:
                continue
            role = "user" if h.get("role") == "user" else "model"
            contents.append(genai_types.Content(role=role, parts=[genai_types.Part.from_text(text=text)]))
        ctx_prefix = ""
        if req.context:
            ctx_prefix = f"[Travel context: {json.dumps(req.context, ensure_ascii=False)}]\n"
        contents.append(genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=ctx_prefix + req.message)]))

        last_exc = None
        for model_name in GEMINI_FALLBACK_MODELS:
            try:
                stream = await genai_client.aio.models.generate_content_stream(
                    model=model_name,
                    contents=contents,
                    config=genai_types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,
                        temperature=0.7,
                        max_output_tokens=512,
                    ),
                )
                async for chunk in stream:
                    text = getattr(chunk, "text", None)
                    if text:
                        reply += text
                        yield f"data: {json.dumps({'type': 'token', 'text': text}, ensure_ascii=False)}\n\n"
                break  # success — don't try fallback
            except Exception as exc:
                last_exc = exc
                logger.warning("Gemini %s unavailable: %s", model_name, exc)
                # if we already streamed something, don't attempt a different model
                if reply:
                    break
                continue
        if not reply and last_exc is not None:
            reply = "Main abhi concierge se connect nahi ho pa raha. Thodi der me try karein."
            yield f"data: {json.dumps({'type': 'token', 'text': reply}, ensure_ascii=False)}\n\n"

        await db.chat_messages.insert_one({
            "message": req.message, "reply": reply, "language": req.language,
            "model": GEMINI_MODEL,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------- app wiring ----------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
