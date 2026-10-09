import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Globe2, Headphones, ShieldCheck, Sparkles } from "lucide-react";
import SearchBar from "../components/SearchBar";
import { http } from "../lib/api";

const HERO_IMAGE = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1800&q=80";

export default function Home() {
  const [featured, setFeatured] = useState({ destinations: [], collections: [] });
  const navigate = useNavigate();

  useEffect(() => {
    http.get("/featured/destinations").then(({ data }) => setFeatured(data)).catch(() => {});
  }, []);

  const openDest = (city) => {
    const q = new URLSearchParams({ service: "hotels", origin: city, destination: city, travellers: 2 }).toString();
    navigate(`/search?${q}`);
  };

  return (
    <>
      <section className="hero" data-testid="hero">
        <div className="hero-bg" style={{ backgroundImage: `url(${HERO_IMAGE})` }}/>
        <div className="hero-inner">
          <div className="hero-eyebrow"><Sparkles size={13}/> Intelligent travel concierge · 2026</div>
          <h1 data-testid="hero-heading">Go somewhere<br/><em>worth remembering.</em></h1>
          <p className="hero-copy">
            One intelligent conversation for flights, stays, road journeys and the little details that make a trip feel like yours — in your language, at your pace.
          </p>
          <div className="hero-stats">
            <div className="hero-stat"><strong>12k+</strong><span>Curated stays</span></div>
            <div className="hero-stat"><strong>8 langs</strong><span>Voice assistant</span></div>
            <div className="hero-stat"><strong>24/7</strong><span>AI concierge</span></div>
          </div>
        </div>
      </section>

      <div className="search-card">
        <SearchBar/>
      </div>

      <section className="section" data-testid="destinations-section">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">Trending now</div>
            <h2>Where India is wandering this season</h2>
          </div>
          <p className="section-sub">Hand-picked destinations our concierge is planning the most this month.</p>
        </div>
        <div className="dest-grid">
          {featured.destinations.map((d) => (
            <div key={d.city} className="dest-card" onClick={() => openDest(d.city)} data-testid={`dest-card-${d.city.toLowerCase()}`}>
              <img src={d.image} alt={d.city} loading="lazy"/>
              <div className="dest-info">
                <div className="dest-tag">{d.tag}</div>
                <h3>{d.city}</h3>
                <div className="dest-price">From <strong>₹{d.from_price.toLocaleString("en-IN")}</strong> · {d.country}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section" data-testid="collections-section">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">Curated trips</div>
            <h2>Journeys crafted by our concierge</h2>
          </div>
          <p className="section-sub">Signature itineraries from India and beyond — ready to personalise.</p>
        </div>
        <div className="collection-grid">
          {featured.collections.map((c) => (
            <div key={c.title} className="collection-card" onClick={() => openDest(c.title.split(" ")[0])} data-testid={`collection-${c.title.replace(/\s/g,'-').toLowerCase()}`}>
              <img src={c.image} alt={c.title} loading="lazy"/>
              <div className="collection-body">
                <h3>{c.title}</h3>
                <div style={{color:'var(--muted)',fontSize:12}}>{c.nights} nights · Fully guided</div>
                <div className="collection-meta">
                  <span>Starting from</span>
                  <span className="collection-price">₹{c.price.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section" data-testid="why-section">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">Why DestinoWay</div>
            <h2>A travel desk that actually understands you</h2>
          </div>
        </div>
        <div className="collection-grid">
          <div className="collection-card" style={{padding:'32px 28px'}}>
            <Globe2 size={28} style={{color:'var(--teal)'}}/>
            <h3 style={{marginTop:14}}>Any language, any script</h3>
            <p style={{color:'var(--muted)',fontSize:13,lineHeight:1.6}}>Chat or speak in Hindi, Hinglish, Bengali, Tamil, Telugu, Marathi — reply comes back in your language and your voice.</p>
          </div>
          <div className="collection-card" style={{padding:'32px 28px'}}>
            <ShieldCheck size={28} style={{color:'var(--teal)'}}/>
            <h3 style={{marginTop:14}}>Transparent pricing</h3>
            <p style={{color:'var(--muted)',fontSize:13,lineHeight:1.6}}>Clear fare breakdown, no hidden fees. Razorpay-secured INR checkout, instant e-vouchers.</p>
          </div>
          <div className="collection-card" style={{padding:'32px 28px'}}>
            <Headphones size={28} style={{color:'var(--teal)'}}/>
            <h3 style={{marginTop:14}}>Human-level planning</h3>
            <p style={{color:'var(--muted)',fontSize:13,lineHeight:1.6}}>Day-by-day itineraries, hotel + flight combos, and a saved trip board you can share with family.</p>
          </div>
        </div>
      </section>

      <footer style={{textAlign:'center',padding:'60px 20px 40px',color:'var(--muted)',fontSize:12,borderTop:'1px solid var(--line)',marginTop:60}}>
        © {new Date().getFullYear()} DestinoWay · Crafted with care in India
      </footer>
    </>
  );
}
