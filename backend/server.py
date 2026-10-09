from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import hashlib
from typing import Any, Dict, Literal, Optional
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timezone
from fastapi.responses import StreamingResponse
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

class SearchRequest(BaseModel):
    service: Literal['flights', 'hotels', 'buses', 'cabs']
    origin: str = 'New Delhi'
    destination: str = 'Goa'
    start_date: str = '2026-05-18'
    end_date: str = '2026-05-22'
    travellers: int = 2
    budget: Optional[float] = None
    sort: Literal['recommended', 'price', 'duration'] = 'recommended'

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    language: str = 'auto'
    context: Dict[str, Any] = Field(default_factory=dict)

class TripSaveRequest(BaseModel):
    title: str = 'My DestinoWay trip'
    items: List[Dict[str, Any]] = Field(default_factory=list)
    origin: str = ''
    destination: str = ''
    dates: str = ''

def _seed(text: str) -> int:
    return int(hashlib.sha1(text.encode()).hexdigest()[:8], 16)

def _mock_results(req: SearchRequest) -> List[Dict[str, Any]]:
    city = req.destination.title()
    origin = req.origin.title()
    seed = _seed(f'{req.service}:{origin}:{city}:{req.start_date}')
    if req.service == 'flights':
        names = [('IndiGo', '6E'), ('Air India', 'AI'), ('Vistara', 'UK'), ('Emirates', 'EK')]
        return [{
            'id': f'fl-{seed}-{i}', 'type': 'flight', 'provider': 'DestinoWay demo', 'mode': 'DEMO',
            'title': f'{code} {100+i*47}', 'brand': brand, 'origin': origin, 'destination': city,
            'departure': f'{req.start_date}T{6+i*2:02d}:20:00', 'arrival': f'{req.start_date}T{9+i*2:02d}:05:00',
            'duration': f'{3+i}h 45m', 'stops': 0 if i < 2 else 1, 'price': 4290 + ((seed >> i) % 7) * 780,
            'currency': 'INR', 'meta': ['Cabin bag', 'Free changes' if i % 2 == 0 else '15 kg check-in'],
            'deep_link': 'https://www.akbartravels.com/'
        } for i, (brand, code) in enumerate(names)]
    if req.service == 'hotels':
        names = ['The Palm Grove', 'Casa Amora', 'The Leela Palace', 'Coastal House']
        return [{
            'id': f'ho-{seed}-{i}', 'type': 'hotel', 'provider': 'DestinoWay demo', 'mode': 'DEMO',
            'title': names[i], 'brand': f'{city} · {5-i%2} star', 'origin': city, 'destination': city,
            'rating': round(4.4 - i * .1, 1), 'location': ['Candolim', 'Panaji', 'Baga', 'Dona Paula'][i],
            'price': 5800 + ((seed >> i) % 6) * 1100, 'currency': 'INR', 'meta': ['Breakfast included', 'Free cancellation'],
            'deep_link': 'https://www.akbartravels.com/hotels'
        } for i in range(4)]
    if req.service == 'buses':
        names = ['IntrCity SmartBus', 'Zingbus', 'Volvo Multi-Axle', 'Neeta Travels']
        return [{
            'id': f'bu-{seed}-{i}', 'type': 'bus', 'provider': 'DestinoWay demo', 'mode': 'DEMO',
            'title': names[i], 'brand': 'AC sleeper · live tracking', 'origin': origin, 'destination': city,
            'departure': f'{req.start_date}T{18+i:02d}:00:00', 'arrival': f'{req.start_date}T{7+i:02d}:30:00',
            'duration': f'{11+i}h 30m', 'stops': 2, 'price': 980 + i * 260, 'currency': 'INR',
            'meta': ['Charging point', 'Blanket included'], 'deep_link': 'https://www.akbartravels.com/'
        } for i in range(4)]
    names = ['Goa Airport Transfers', 'BluSmart Executive', 'Savaari Outstation', 'KTC Premium Cab']
    return [{
        'id': f'ca-{seed}-{i}', 'type': 'cab', 'provider': 'DestinoWay demo', 'mode': 'DEMO',
        'title': names[i], 'brand': 'Sedan · meet & greet', 'origin': origin, 'destination': city,
        'duration': f'{35+i*8} min', 'price': 899 + i * 340, 'currency': 'INR',
        'meta': ['Toll included', 'Free wait 45 min'], 'deep_link': 'https://www.akbartravels.com/'
    } for i in range(4)]

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

@api_router.post('/travel/search')
async def travel_search(req: SearchRequest):
    results = _mock_results(req)
    if req.budget is not None:
        results = [r for r in results if r['price'] <= req.budget] or results
    if req.sort == 'price': results.sort(key=lambda r: r['price'])
    return {'status': 'success', 'mode': 'DEMO', 'service': req.service, 'results': results, 'searched_at': datetime.now(timezone.utc).isoformat()}

@api_router.post('/chat/stream')
async def chat_stream(req: ChatRequest):
    key = os.environ.get('EMERGENT_LLM_KEY')
    async def generator():
        reply = ''
        try:
            chat = LlmChat(api_key=key, session_id=f'destinoway-{uuid.uuid4()}', system_message=(
                'You are DestinoWay, an elite multilingual travel concierge. Reply in the same language as the user. '
                'Be warm, concise, practical, and honest that current transport results are DEMO until Akbar Travels is connected. '
                'Help with flights, hotels, buses, cabs, budgets, itineraries and handoff links. Never claim a booking is confirmed.'
            )).with_model('gemini', 'gemini-3.1-pro-preview')
            prompt = f"Travel context: {json.dumps(req.context, ensure_ascii=False)}\nUser: {req.message}"
            async for event in chat.stream_message(UserMessage(text=prompt)):
                if isinstance(event, TextDelta):
                    reply += event.content
                    yield f"data: {json.dumps({'type': 'token', 'text': event.content}, ensure_ascii=False)}\n\n"
                elif isinstance(event, StreamDone):
                    break
        except Exception as exc:
            logging.getLogger(__name__).warning('AI chat unavailable: %s', exc)
            reply = ('Main aapki trip planning mein madad karunga — destination, dates, budget aur travellers bataiye. '
                     'Abhi results demo mode mein hain; Akbar Travels API connect hone par live options milenge.')
            yield f"data: {json.dumps({'type': 'token', 'text': reply}, ensure_ascii=False)}\n\n"
        await db.chat_messages.insert_one({'message': req.message, 'reply': reply, 'language': req.language, 'created_at': datetime.now(timezone.utc).isoformat()})
        yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
    return StreamingResponse(generator(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

@api_router.post('/trips')
async def save_trip(req: TripSaveRequest):
    share_id = uuid.uuid4().hex[:10]
    doc = {**req.model_dump(), 'share_id': share_id, 'created_at': datetime.now(timezone.utc).isoformat()}
    response_doc = dict(doc)
    await db.saved_trips.insert_one(dict(doc))
    return {'status': 'success', 'share_id': share_id, 'trip': response_doc}

@api_router.get('/trips/{share_id}')
async def get_trip(share_id: str):
    trip = await db.saved_trips.find_one({'share_id': share_id}, {'_id': 0})
    if not trip: raise HTTPException(status_code=404, detail='Trip not found')
    return trip

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()