import { useLocation, useNavigate } from "react-router-dom";
import { useState, useMemo, useEffect } from "react";
import { getProfile } from "../api/profileApi";
import { createBooking } from "../api/cinemaApi";

type PaymentState = {
    showId?: number | null;
    movieTitle?: string;
    showtime?: string;
    selectedSeats?: string[];
    email?: string;
    subtotal?: number;
    adultQty?: number;
    childQty?: number;
    seniorQty?: number;
};

type SavedPaymentMethod = {
    card_id: number;
    card_number: string;
    expiration_date: string;
};

function formatCardNumber(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    const groups = digits.match(/.{1,4}/g);
    return groups ? groups.join(" ") : "";
}

function formatExpiry(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length === 0) return "";
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function isValidExpiry(value: string) {
    const match = value.match(/^(\d{2})\/(\d{2})$/);
    if (!match) return false;
    
    const mm = parseInt(match[1], 10);
    const yy = parseInt(match[2], 10) + 2000;

    if (mm < 1 || mm > 12) return false;
    
    const now = new Date();
    const currentYear = now.getFullYear() % 100;
    const currentMonth = now.getMonth() + 1;
    
    if (yy < currentYear) return false;
    if (yy === currentYear && mm < currentMonth) return false;

    return true;
}

function formatMaskedCardDisplay(cardNumber: string): string {
    const digits = (cardNumber || "").replace(/\D/g, "");
    if (digits.length < 4) {
        return `**** **** **** ${digits.slice(-4)}`;
    }
    return `**** **** **** ****`;
}

function formatExpMMYY(isoDate: string): string {
    const s = (isoDate || "").trim();
    if (s.length >= 7) {
        const yyyy = s.slice(0, 4);
        const mm = s.slice(5, 7);
        if (/^\d{2}\/\d{4}$/.test(`${mm}/${yyyy}`)) {
            return `${mm}/${yyyy.slice(2)}`;
        }
    }
    return "";
}

export default function Payment() {
    const navigate = useNavigate();
    const location = useLocation();
    const state = (location.state as PaymentState | null) ?? {};

    const showId = state.showId ?? null;
    const movieTitle = state.movieTitle ?? "Movie Title";
    const showtime = state.showtime ?? "Showtime";
    const selectedSeats = state.selectedSeats ?? [];
    const email = state.email ?? "";
    const subtotal = state.subtotal ?? 0;
    const adultQty = state.adultQty ?? 0;
    const childQty = state.childQty ?? 0;
    const seniorQty = state.seniorQty ?? 0;

    const taxRate = 0.07;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    const [savedCards, setSavedCards] = useState<SavedPaymentMethod[]>([]);
    const [loadingCards, setLoadingCards] = useState(false);
    const [savedCardsError, setSavedCardsError] = useState("");
    const [paymentMode, setPaymentMode] = useState<"saved" | "new">("saved");
    const [selectedSavedCardId, setSelectedSavedCardId] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [cardholderName, setCardholderName] = useState("");
    const [cardNumber, setCardNumber] = useState("");
    const [expiry, setExpiry] = useState("");
    const [cvv, setCvv] = useState("");
    const [billingZip, setBillingZip] = useState("");
    const [saveCard, setSaveCard] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        let cancelled = false;
        async function loadSavedCards() {
            try {
                setLoadingCards(true);
                setSavedCardsError("");

                const profile = await getProfile();
                const cards = (profile?.payment_cards ?? []) as unknown as SavedPaymentMethod[];

                if (!cancelled) {
                    setSavedCards(cards);
                    if (cards.length > 0) {
                        setPaymentMode("saved");
                        setSelectedSavedCardId(cards[0].card_id);
                    } else {
                        setPaymentMode("new");
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    setSavedCards([]);
                    setPaymentMode("new");
                    setSavedCardsError( err instanceof Error ? err.message : "Failed to load saved payment methods" );
                }
            } finally {
                if (!cancelled) {
                    setLoadingCards(false);
                }
            }
        }
        loadSavedCards();
        return () => {
            cancelled = true;
        };
    }, []);

    const selecteddSavedCard = useMemo(() => {
        return savedCards.find((c) => c.card_id === selectedSavedCardId) ?? null;
    }, [savedCards, selectedSavedCardId]);

    const cardBrand = useMemo(() => {
        const digits = paymentMode === "saved" ? (selecteddSavedCard?.card_number ?? "").replace(/\D/g, "") : cardNumber.replace(/\D/g, "");
        if (digits.startsWith("4")) return "Visa";
        if (digits.startsWith("5")) return "Mastercard";
        if (digits.startsWith("3")) return "Amex";
        if (digits.startsWith("6")) return "Discover";
        return "Card";
    }, [paymentMode, selecteddSavedCard, cardNumber]);

    const previewCardNumber = 
        paymentMode === "saved" ? formatMaskedCardDisplay(selecteddSavedCard?.card_number ?? "")
        : cardNumber || "**** **** **** ****";
    
    const previewExpiry =
        paymentMode === "saved"
            ? formatExpMMYY(selecteddSavedCard?.expiration_date ?? "") || "MM/YY"
            : expiry || "MM/YY";

    async function handlePayment(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (!showId) {
            setError("Missing showtime information. Please restart checkout.");
            return;
        }

        const totalTickets = adultQty + childQty + seniorQty;
        if (totalTickets <= 0) {
            setError("Missing ticket quantity information. Please restart checkout.");
            return;
        }
        if (!selectedSeats.length || selectedSeats.length !== totalTickets) {
            setError("Seat selection is incomplete. Please restart checkout.");
            return;
        }

        if (paymentMode === "saved") {
            if (!selecteddSavedCard) {
                setError("Please select a saved card");
                return;
            }
            try {
                setSubmitting(true);
                const response = await createBooking({
                    showId: Number(showId),
                    cardId: selecteddSavedCard.card_id,
                    selectedSeats,
                    ticketCounts: {
                        adult: adultQty,
                        child: childQty,
                        senior: seniorQty,
                    },
                });

                setSuccess("Payment successful! Your booking was saved.");

                navigate("/order-confirmation", { 
                    state:  response,
                });
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to create booking");
            } finally {
                setSubmitting(false);
            }
            return;
        }
        

        const cardDigits = cardNumber.replace(/\D/g, "");
        const cvvDigits = cvv.replace(/\D/g, "");
        const zipDigits = billingZip.replace(/\D/g, "");

        if (cardholderName.trim() === "") {
            setError("Cardholder name is required");
            return;
        }
        if (cardDigits.length !== 16) {
            setError("Card number must be 16 digits");
            return;
        }
        if (!isValidExpiry(expiry)) {
            setError("Invalid expiration date");
            return;
        }
        if (cvvDigits.length < 3 || cvvDigits.length > 4) {
            setError("CVV must be 3 or 4 digits");
            return;
        }
        if (zipDigits.length < 5) {
            setError("Invalid billing ZIP code");
            return;
        }

        setError("For this demo, please use a saved card to complete checkout.");
    }

    return (
        <div
            style={{
                maxWidth: "1100px",
                margin: "0 auto",
                padding: "24px",
                display: "grid",
                gridTemplateColumns: "1.4fr 1fr",
                gap: "24px",
            }}
        >
            <section
                style={{
                    border: "1px solid #ddd",
                    borderRadius: "12px",
                    padding: "24px",
                    
                }}
            >
                <h1 style={{ marginTop: 0 }}>Payment</h1>
                <p style={{ color: "#555", marginBottom: "24px" }}>
                    This is a mock payment page for Sprint 3. Users can choose a saved
                    card or enter a new one, but real payment processing is not required yet.
                </p>

                <div
                    style={{
                        borderRadius: "16px",
                        padding: "20px",
                        marginBottom: "24px",
                        color: "white",
                        background:
                            "linear-gradient(135deg, #1f2937 0%, #111827 45%, #374151 100%)",
                        minHeight: "200px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <span style={{ fontSize: "0.95rem", opacity: 0.9 }}>
                            Mock Payment Card
                        </span>
                        <span style={{ fontWeight: 700 }}>{cardBrand}</span>
                    </div>

                    <div style={{ fontSize: "1.5rem", letterSpacing: "2px", margin: "18px 0" }}>
                        {previewCardNumber}
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            gap: "16px",
                            alignItems: "end",
                        }}
                    >
                        <div>
                            <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>CARDHOLDER</div>
                            <div>{paymentMode === "saved" ? "SAVED CARD" : cardholderName || "FULL NAME"}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>EXPIRES</div>
                            <div>{previewExpiry}</div>
                        </div>
                    </div>
                </div>

                {error && (
                    <p
                        style={{
                            color: "crimson",
                            marginBottom: "16px",
                            fontWeight: 500,
                        }}
                    >
                        {error}
                    </p>
                )}

                {success && (
                    <p
                        style={{
                            color: "green",
                            marginBottom: "16px",
                            fontWeight: 500,
                        }}
                    >
                        {success}
                    </p>
                )}

                <form onSubmit={handlePayment}>
                    <div style={{ marginBottom: "20px" }}>
                        <h3 style={{ marginBottom: "10px" }}>Payment Method</h3>

                        <div
                            style={{
                                display: "flex",
                                gap: "18px",
                                flexWrap: "wrap",
                                marginBottom: "12px",
                            }}
                        >
                            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <input
                                    type="radio"
                                    name="paymentMode"
                                    checked={paymentMode === "saved"}
                                    onChange={() => setPaymentMode("saved")}
                                    disabled={savedCards.length === 0}
                                />
                                Use Saved Card
                            </label>

                            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <input
                                    type="radio"
                                    name="paymentMode"
                                    checked={paymentMode === "new"}
                                    onChange={() => setPaymentMode("new")}
                                />
                                Enter New Card
                            </label>
                        </div>

                        {loadingCards && <p>Loading saved cards...</p>}

                        {!loadingCards && savedCardsError && (
                            <p style={{ color: "crimson" }}>{savedCardsError}</p>
                        )}

                        {!loadingCards && paymentMode === "saved" && savedCards.length === 0 && (
                            <p style={{ color: "#555" }}>
                                No saved cards found. Please enter a new card.
                            </p>
                        )}

                        {!loadingCards && paymentMode === "saved" && savedCards.length > 0 && (
                            <div style={{ display: "grid", gap: "10px" }}>
                                {savedCards.map((card) => (
                                    <label
                                        key={card.card_id}
                                        style={{
                                            border: "1px solid",
                                            borderRadius: "10px",
                                            padding: "12px",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            gap: "12px",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                            <input
                                                type="radio"
                                                name="savedCard"
                                                checked={selectedSavedCardId === card.card_id}
                                                onChange={() => setSelectedSavedCardId(card.card_id)}
                                            />
                                            <div>
                                                <div>{formatMaskedCardDisplay(card.card_number)}</div>
                                                <div style={{ fontSize: "0.9rem", color: "#666" }}>
                                                    Exp {formatExpMMYY(card.expiration_date)}
                                                </div>
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {paymentMode === "new" && (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr",
                                gap: "16px",
                            }}
                        >
                            <div>
                                <label
                                    htmlFor="cardholderName"
                                    style={{ display: "block", marginBottom: "8px" }}
                                >
                                    Name on Card
                                </label>
                                <input
                                    id="cardholderName"
                                    type="text"
                                    value={cardholderName}
                                    onChange={(e) => setCardholderName(e.target.value)}
                                    placeholder="Full name"
                                    style={{
                                        width: "100%",
                                        padding: "12px",
                                        borderRadius: "8px",
                                        border: "1px solid",
                                    }}
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="cardNumber"
                                    style={{ display: "block", marginBottom: "8px" }}
                                >
                                    Card Number
                                </label>
                                <input
                                    id="cardNumber"
                                    type="text"
                                    inputMode="numeric"
                                    value={cardNumber}
                                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                                    placeholder="1234 5678 9012 3456"
                                    style={{
                                        width: "100%",
                                        padding: "12px",
                                        borderRadius: "8px",
                                        border: "1px solid",
                                    }}
                                />
                            </div>

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr 1fr",
                                    gap: "16px",
                                }}
                            >
                                <div>
                                    <label
                                        htmlFor="expiry"
                                        style={{ display: "block", marginBottom: "8px" }}
                                    >
                                        Expiration
                                    </label>
                                    <input
                                        id="expiry"
                                        type="text"
                                        inputMode="numeric"
                                        value={expiry}
                                        onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                                        placeholder="MM/YY"
                                        style={{
                                            width: "100%",
                                            padding: "12px",
                                            borderRadius: "8px",
                                            border: "1px solid",
                                        }}
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="cvv"
                                        style={{ display: "block", marginBottom: "8px" }}
                                    >
                                        CVV
                                    </label>
                                    <input
                                        id="cvv"
                                        type="password"
                                        inputMode="numeric"
                                        value={cvv}
                                        onChange={(e) =>
                                            setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))
                                        }
                                        placeholder="123"
                                        style={{
                                            width: "100%",
                                            padding: "12px",
                                            borderRadius: "8px",
                                            border: "1px solid ",
                                        }}
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="billingZip"
                                        style={{ display: "block", marginBottom: "8px" }}
                                    >
                                        Billing ZIP
                                    </label>
                                    <input
                                        id="billingZip"
                                        type="text"
                                        inputMode="numeric"
                                        value={billingZip}
                                        onChange={(e) =>
                                            setBillingZip(
                                                e.target.value.replace(/\D/g, "").slice(0, 10)
                                            )
                                        }
                                        placeholder="30602"
                                        style={{
                                            width: "100%",
                                            padding: "12px",
                                            borderRadius: "8px",
                                            border: "1px solid",
                                        }}
                                    />
                                </div>
                            </div>

                            <label
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    marginTop: "4px",
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={saveCard}
                                    onChange={(e) => setSaveCard(e.target.checked)}
                                />
                                Save this card to my account
                            </label>
                        </div>
                    )}

                    <div
                        style={{
                            display: "flex",
                            gap: "12px",
                            marginTop: "20px",
                            flexWrap: "wrap",
                        }}
                    >
                        {success ? (
                            <button
                                type="button"
                                onClick={() => navigate("/")}
                                style={{
                                    padding: "12px 18px",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                }}
                            >
                                Return to Home
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => navigate(-1)}
                                    style={{
                                        padding: "12px 18px",
                                        borderRadius: "8px",
                                        cursor: "pointer",
                                    }}
                                >
                                    Back
                                </button>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    style={{
                                        padding: "12px 18px",
                                        borderRadius: "8px",
                                        cursor: "pointer",
                                    }}
                                >
                                    {submitting ? "Submitting..." : "Submit Mock Payment"}
                                </button>
                            </>
                        )}
                    </div>
                </form>
            </section>

            <aside
                style={{
                    border: "none",
                    borderRadius: 0,
                    padding: 0,
                    background: "transparent",
                    height: "fit-content",
                }}
            >
                <h2 style={{ marginTop: 0 }}>Payment Summary</h2>

                <div style={{ lineHeight: 1.8 }}>
                    <p>
                        <strong>Movie:</strong> {movieTitle}
                    </p>
                    <p>
                        <strong>Showtime:</strong> {showtime}
                    </p>
                    <p>
                        <strong>Seats:</strong>{" "}
                        {selectedSeats.length ? selectedSeats.join(", ") : "None"}
                    </p>
                    <p>
                        <strong>Email:</strong> {email || "Not provided"}
                    </p>
                </div>

                <hr style={{ margin: "18px 0" }} />

                <div style={{ display: "grid", gap: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Subtotal</span>
                        <span>${subtotal.toFixed(2)}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Estimated Tax</span>
                        <span>${taxAmount.toFixed(2)}</span>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontWeight: 700,
                            fontSize: "1.05rem",
                        }}
                    >
                        <span>Total</span>
                        <span>${total.toFixed(2)}</span>
                    </div>
                </div>
            </aside>
        </div>
    );
}