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

const rows = ["A", "B", "C", "D", "E", "F"];
const seatsPerRow = 8;

function generateSeats(): Seat[] {
  const takenSeats = new Set(["A3", "A4", "B6", "C2", "D7", "E5"]);

  const seats: Seat[] = [];

  for (const row of rows) {
    for (let i = 1; i <= seatsPerRow; i++) {
      const id = `${row}${i}`;
      seats.push({
        id,
        row,
        number: i,
        status: takenSeats.has(id) ? "taken" : "available",
      });
    }
  }

  return seats;
}

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
  const [seats, setSeats] = useState<Seat[]>(generateSeats());

  const totalTickets = adultQty + childQty + seniorQty;

  const selectedSeats = useMemo(
    () => seats.filter((seat) => seat.status === "selected"),
    [seats]
  );

  const subtotal = useMemo(() => {
    return adultQty * ADULT_PRICE + childQty * CHILD_PRICE + seniorQty * SENIOR_PRICE;
  }, [adultQty, childQty, seniorQty]);

  const toggleSeat = (seatId: string) => {
    setSeats((prev) =>
      prev.map((seat) => {
        if (seat.id !== seatId) return seat;
        if (seat.status === "taken") return seat;

        // optional limit: cannot select more seats than tickets
        if (
          seat.status === "available" &&
          selectedSeats.length >= totalTickets
        ) {
          return seat;
        }

        return {
          ...seat,
          status: seat.status === "selected" ? "available" : "selected",
        };
      })
    );
  };

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

          <div className="seating-card">
            <div className="seating-header">
              <h2>Select Seats</h2>
              <div className="seat-legend">
                <span><i className="seat-demo available"></i> Available</span>
                <span><i className="seat-demo selected"></i> Selected</span>
                <span><i className="seat-demo taken"></i> Taken</span>
              </div>
            </div>

            <div className="screen">SCREEN</div>

            <div className="seat-grid">
              {rows.map((row) => (
                <div className="seat-row" key={row}>
                  <div className="row-label">{row}</div>

                  {seats
                    .filter((seat) => seat.row === row)
                    .map((seat, index) => (
                      <button
                        key={seat.id}
                        className={`seat ${seat.status} ${
                          index === 3 ? "seat-gap-right" : ""
                        }`}
                        onClick={() => toggleSeat(seat.id)}
                        disabled={seat.status === "taken"}
                        aria-label={`Seat ${seat.id}`}
                        type="button"
                      >
                        {seat.number}
                      </button>
                    ))}
                </div>
              ))}
            </div>
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

            <div className="selected-seats-box">
              <h3>Selected Seats</h3>
              {selectedSeats.length > 0 ? (
                <p>{selectedSeats.map((seat) => seat.id).join(", ")}</p>
              ) : (
                <p>No seats selected yet.</p>
              )}
            </div>

            <button className="continue-btn" type="button">
              Continue
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}