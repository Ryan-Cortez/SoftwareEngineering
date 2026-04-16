import { useMemo, useState } from "react";
import { redirect, useLocation, useNavigate } from "react-router-dom";


type CheckoutState = {
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
    selectedSeats?: string[];
};

function getStoredEmail(): string {
    try {
        return (
            localStorage.getItem("userEmail") ||
            localStorage.getItem("email") || ""
        );
    } catch (error) {
        console.error("Error retrieving stored email:", error);
        return "";
    }
}

function isUserLoggedIn(): boolean {
    try {
        const token = localStorage.getItem("authToken");
        return !!token;
    } catch (error) {
        return false;
    }
}

export default function Checkout() {
    const navigate = useNavigate();
    const location = useLocation();
    const state = (location.state as CheckoutState | null) ?? {};

    const movieId = state.movieId ?? null;
    const movieTitle = state.movieTitle ?? "Movie Title";
    const showtime = state.showtime ?? "Showtime";
    const poster = state.poster ?? "https://via.placeholder.com/300x450?text=No+Image";
    const adultQty = state.adultQty ?? 0;
    const childQty = state.childQty ?? 0;
    const seniorQty = state.seniorQty ?? 0;
    const prices = state.prices ?? { adult: 12.99, child: 8.99, senior: 9.99 };
    const selectedSeats = state.selectedSeats ?? [];

    const [email, setEmail] = useState(getStoredEmail());
    const [error, setError] = useState("");


    const subtotal = useMemo(() => {
        return (
            adultQty * prices.adult +
            childQty * prices.child +
            seniorQty * prices.senior
        );
    }, [adultQty, childQty, seniorQty, prices]);

    const totalTickets = adultQty + childQty + seniorQty;

    function proceedToPayment() {
        setError("");

        if(!selectedSeats.length || selectedSeats.length !== totalTickets) {
            setError("Please select your seats before proceeding.");
            return;
        }

        if (!email.trim()) {
            setError("Please confirm or enter your email address.");
            return;
        }

        if (!isUserLoggedIn()) {
            navigate("/login", {
                state: {
                    redirectTo: "/checkout",
                    bookingData: {
                        movieId,
                        movieTitle,
                        showtime,
                        poster,
                        adultQty,
                        childQty,
                        seniorQty,
                        prices,
                        selectedSeats,
                        email
                    },
                },
            });
            return;     
        }

        navigate("/payment", {
            state: {
                movieId,
                movieTitle,
                showtime,
                poster,
                adultQty,
                childQty,
                seniorQty,
                prices,
                selectedSeats,
                email,
                subtotal,
             },
        });
    }
    
    return (
        <main className="checkout-page">
            <div className="checkout-container"
                style = {{ maxWidth: "1100px", margin: "0 auto", padding: "24px", display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
                    <section style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "24px", background: "#fff",}}>
                        <h1 style={{ marginTop: 0 }}>Checkout</h1>
                        <p> Review your order summary and confirm your email before proceeding to payment.</p>

                        {error && <p style={{ color: "crimson" }}>{error}</p>}

                        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", marginTop: "20px", alignItems: "flex-start" }}>
                            <img src={poster} alt={movieTitle} style={{ width: "150px", borderRadius: "8px" }} />
                            <div style={{ flex: 1, minWidth: "260px" }}>
                                <h2 style={{ marginTop: 0 }}>{movieTitle}</h2>
                                <p><strong>Showtime:</strong> {showtime}</p>
                                <p><strong>Seats:</strong> {" "}{selectedSeats.length ? selectedSeats.join(", ") : "None selected"}</p>
                                <p><strong>Adult Tickets:</strong> {adultQty}</p>
                                <p><strong>Child Tickets:</strong> {childQty}</p>
                                <p><strong>Senior Tickets:</strong> {seniorQty}</p>
                            </div>
                        </div>
                        <div style={{ marginTop: "24px" }}>
                            <h3>Confirm Email</h3>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email address"
                                style={{ width: "100%", padding: "12px", maxWidth: "420px", borderRadius: "8px", border: "1px solid #ccc" }}
                            />
                        </div>
                        <div style={{ display: "flex", gap: "12px", marginTop: "18px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => navigate(-1)}>
                                Back
                            </button>
                            <button type="button" onClick={proceedToPayment}>
                                Proceed to Payment
                            </button>
                        </div>
                    </section>

                    <aside style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "24px", background: "#fff", height: "fit-content" }}>
                        <h2>Order Summary</h2>
                        <div style={{ display: "grid", gap: "10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span>Adult x {adultQty}</span>
                                <span>${(adultQty * prices.adult).toFixed(2)}</span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span>Child x {childQty}</span>
                                <span>${(childQty * prices.child).toFixed(2)}</span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span>Senior x {seniorQty}</span>
                                <span>${(seniorQty * prices.senior).toFixed(2)}</span>
                            </div>
                            <hr />

                            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "700" }}>
                                <span>Subtotal</span>
                                <span>${subtotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </aside>
            </div>
        </main>
    );        
}
