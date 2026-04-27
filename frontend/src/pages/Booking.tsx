import { useMemo, useState } from "react";
import "../styles/booking.css";
import { useLocation , useNavigate } from "react-router-dom";

type SeatStatus = "available" | "selected" | "taken";

type Seat = {
  id: string;
  row: string;
  number: number;
  status: SeatStatus;
};

type BookingPageProps = {
  movieId?: number;
  movieTitle?: string;
  showtime?: string;
  poster?: string;
};

const ADULT_PRICE = 12.99;
const CHILD_PRICE = 8.99;
const SENIOR_PRICE = 9.99;


export default function BookingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as BookingPageProps | null) ?? {};

  const movieId = state.movieId ?? null
  const movieTitle = state.movieTitle ?? "CaptainAmerica: Brave New World";
  const showtime = state.showtime ?? "7:30 PM";
  const poster = state.poster ?? "https://via.placeholder.com/300x450?text=No+Image"; 

  const [adultQty, setAdultQty] = useState<number>(1);
  const [childQty, setChildQty] = useState<number>(0);
  const [seniorQty, setSeniorQty] = useState<number>(0);
  const [error, setError] = useState<string>("");

  const totalTickets = adultQty + childQty + seniorQty;

  const subtotal = useMemo(() => {
    return adultQty * ADULT_PRICE + childQty * CHILD_PRICE + seniorQty * SENIOR_PRICE;
  }, [adultQty, childQty, seniorQty]);


  function handleContinue() {
  setError("");
  
  if (totalTickets === 0) {
    setError("Please select at least one ticket.");
    return;
  }
  navigate("/seat-selection", {
    state: {
      movieId,
      movieTitle,
      showtime,
      poster,
      adultQty,
      childQty,
      seniorQty,
      prices: {
        adult: ADULT_PRICE,
        child: CHILD_PRICE,
        senior: SENIOR_PRICE,
      },
      subtotal,
    },
  });
}

  const handleQtyChange = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<number>>
  ) => {
    const parsed = Number(value);

    if (Number.isNaN(parsed) || parsed < 0) {
      setter(0);
      return;
    }

    setter(parsed);
  };

  const serviceFee = totalTickets > 0 ? 2.5 : 0;
  const total = subtotal + serviceFee;

  
  return (
    <div className="booking-page">
      <div className="booking-container">
        <section className="booking-left">
          <div className="movie-summary-card">
            <img src={poster} alt={movieTitle} className="movie-poster" />

            <div className="movie-summary-info">
              <p className="page-tag">Booking</p>
              <h1>{movieTitle}</h1>
              <p className="showtime-pill">{showtime}</p>
              <p className="helper-text">
                Choose your tickets and seats. This is a front-end prototype for the
                booking flow.
              </p>
            </div>
          </div>

          <div className="ticket-card">
            <h2>Tickets</h2>

            <div className="ticket-row">
              <div>
                <h3>Adult</h3>
                <p>${ADULT_PRICE.toFixed(2)}</p>
              </div>
              <input
                type="number"
                min="0"
                value={adultQty}
                onChange={(e) => handleQtyChange(e.target.value, setAdultQty)}
              />
            </div>

            <div className="ticket-row">
              <div>
                <h3>Child</h3>
                <p>${CHILD_PRICE.toFixed(2)}</p>
              </div>
              <input
                type="number"
                min="0"
                value={childQty}
                onChange={(e) => handleQtyChange(e.target.value, setChildQty)}
              />
            </div>

            <div className="ticket-row">
              <div>
                <h3>Senior</h3>
                <p>${SENIOR_PRICE.toFixed(2)}</p>
              </div>
              <input
                type="number"
                min="0"
                value={seniorQty}
                onChange={(e) => handleQtyChange(e.target.value, setSeniorQty)}
              />
            </div>

            <p className="seat-limit-note">
              Select up to <strong>{totalTickets}</strong> seat
              {totalTickets === 1 ? "" : "s"} on the next pag.
            </p>

            {error && (
              <p style={{ color: "crimson", marginTop: "12px" }}>{error}</p>
            )}
            <button className="continue-btn" type="button" onClick={handleContinue} style={{ marginTop: "16px" }}>Continue to Seat Selection</button>
            
          </div>

        </section>

        <aside className="booking-right">
          <div className="summary-card">
            <h2>Order Summary</h2>

            <div className="summary-line">
              <span>Movie</span>
              <span>{movieTitle}</span>
            </div>

            <div className="summary-line">
              <span>Showtime</span>
              <span>{showtime}</span>
            </div>

            <div className="summary-line">
              <span>Adult x {adultQty}</span>
              <span>${(adultQty * ADULT_PRICE).toFixed(2)}</span>
            </div>

            <div className="summary-line">
              <span>Child x {childQty}</span>
              <span>${(childQty * CHILD_PRICE).toFixed(2)}</span>
            </div>

            <div className="summary-line">
              <span>Senior x {seniorQty}</span>
              <span>${(seniorQty * SENIOR_PRICE).toFixed(2)}</span>
            </div>

            <div className="summary-line">
              <span>Service Fee</span>
              <span>${serviceFee.toFixed(2)}</span>
            </div>

            <hr />

            <div className="summary-line total-line">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>

          </div>
        </aside>
      </div>
    </div>
  );
}