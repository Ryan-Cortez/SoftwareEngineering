import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/booking.css";

type SeatStatus = "available" | "selected" | "taken";

type Seat = {
    id: string;
    row: string;
    number: number;
    status: SeatStatus;
};

type SeatSelectionState = {
    movieId?: number | null;
    movieTitle?: string;
    showtime?: string;
    poster?: string;
    adultQty?: number;
    childQty?: number;
    seniorQty?: number;
    prices?: {
        adult: number;
        child: number;
        senior: number;
    };
    subtotal?: number;
};

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

export default function SeatSelection() {
    const navigate = useNavigate();
    const location = useLocation();
    const state = (location.state as SeatSelectionState | null) ?? {};

    const movieId = state.movieId ?? null;
    const movieTitle = state.movieTitle ?? "Movie";
    const showtime = state.showtime ?? "Showtime";
    const poster =
        state.poster ?? "https://via.placeholder.com/300x450?text=Movie+Poster";
    const adultQty = state.adultQty ?? 0;
    const childQty = state.childQty ?? 0;
    const seniorQty = state.seniorQty ?? 0;
    const prices = state.prices ?? { adult: 12.99, child: 8.99, senior: 9.99 };

    const totalTickets = adultQty + childQty + seniorQty;

    const [seats, setSeats] = useState<Seat[]>(generateSeats());
    const [error, setError] = useState("");

    const selectedSeats = useMemo(
        () => seats.filter((seat) => seat.status === "selected"),
        [seats]
    );

    function toggleSeat(seatId: string) {
        setSeats((prev) =>
            prev.map((seat) => {
                if (seat.id !== seatId) return seat;
                if (seat.status === "taken") return seat;

                if (seat.status === "available" && selectedSeats.length >= totalTickets) {
                    return seat;
                }

                return {
                    ...seat,
                    status: seat.status === "selected" ? "available" : "selected",
                };
            })
        );
    }

    function handleContinue() {
        setError("");

        if (totalTickets <= 0) {
            setError("No tickets were selected. Please go back and choose tickets.");
            return;
        }

        if (selectedSeats.length !== totalTickets) {
            setError(`Please select exactly ${totalTickets} seat(s).`);
            return;
        }

        navigate("/checkout", {
            state: {
                movieId,
                movieTitle,
                showtime,
                poster,
                adultQty,
                childQty,
                seniorQty,
                prices,
                selectedSeats: selectedSeats.map((seat) => seat.id),
            },
        });
    }

    return (
        <div className="booking-page">
            <div className="booking-container">
                <section className="booking-left">
                    <div className="movie-summary-card">
                        <img src={poster} alt={movieTitle} className="movie-poster" />

                        <div className="movie-summary-info">
                            <p className="page-tag">Seat Selection</p>
                            <h1>{movieTitle}</h1>
                            <p className="showtime-pill">{showtime}</p>
                            <p className="helper-text">
                                Select exactly {totalTickets} seat
                                {totalTickets === 1 ? "" : "s"}.
                            </p>
                        </div>
                    </div>

                    <div className="seating-card">
                        <div className="seating-header">
                            <h2>Select Seats</h2>
                            <div className="seat-legend">
                                <span>
                                    <i className="seat-demo available"></i> Available
                                </span>
                                <span>
                                    <i className="seat-demo selected"></i> Selected
                                </span>
                                <span>
                                    <i className="seat-demo taken"></i> Taken
                                </span>
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

                        {error && (
                            <p style={{ color: "crimson", marginTop: "16px" }}>{error}</p>
                        )}

                        <div
                            style={{
                                display: "flex",
                                gap: "12px",
                                marginTop: "18px",
                                flexWrap: "wrap",
                            }}
                        >
                            <button
                                className="continue-btn"
                                type="button"
                                onClick={() => navigate(-1)}
                            >
                                Back
                            </button>
                            <button
                                className="continue-btn"
                                type="button"
                                onClick={handleContinue}
                            >
                                Proceed to Checkout
                            </button>
                        </div>
                    </div>
                </section>

                <aside className="booking-right">
                    <div className="summary-card">
                        <h2>Seat Summary</h2>

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
                            <span>${(adultQty * prices.adult).toFixed(2)}</span>
                        </div>

                        <div className="summary-line">
                            <span>Child x {childQty}</span>
                            <span>${(childQty * prices.child).toFixed(2)}</span>
                        </div>

                        <div className="summary-line">
                            <span>Senior x {seniorQty}</span>
                            <span>${(seniorQty * prices.senior).toFixed(2)}</span>
                        </div>

                        <hr />

                        <div className="selected-seats-box">
                            <h3>Selected Seats</h3>
                            {selectedSeats.length > 0 ? (
                                <p>{selectedSeats.map((seat) => seat.id).join(", ")}</p>
                            ) : (
                                <p>No seats selected yet.</p>
                            )}
                            <p style={{ marginTop: "10px" }}>
                                {selectedSeats.length} / {totalTickets} selected
                            </p>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}