import { useEffect, useState } from "react";
import { getProfile, updateProfile, type UserProfile } from "../api/profileApi";
import { getFavorites, removeFavorite } from "../api/favorites";
import type { Movie } from "../api/cinemaApi";

type PaymentMethod = {
    id: number;
    cardHolderName: string;
    cardNumber: string;
    expiry: string;
}

export default function Profile() {
    const [profile, setProfile] = useState<UserProfile>({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
    });

    const [favorites, setFavorites] = useState<Movie[]>([]);

    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
        {
            id: 1,
            cardHolderName: " Bob Ross",
            cardNumber: " **** **** **** 1234",
            expiry: "01/28"
        },
    ]);

    const [newCardHolderName, setNewCardHolderName] = useState("");
    const [newCardNumber, setNewCardNumber] = useState("");
    const [newExpiry, setNewExpiry] = useState("");

    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingFavoites, setLoadingFavorites] = useState(true);
 
    const [saving, setSaving] = useState(false);

    const [profileError, setProfileError] = useState("");
    const [favoritesError, setFavoritesError] = useState("");
    const [paymentError, setPaymentError] = useState("");
    const [saveMessage, setSaveMessage] = useState("");

    useEffect(() => {
        async function loadProfile() {
            try {
                setLoadingProfile(true);
                setProfileError("");

                const data = await getProfile();
                setProfile(data);
            } catch (error) {
                console.error(error);
                setProfileError("Failed to load profile.");
            } finally {
                setLoadingProfile(false)
            }
        }

        async function loadFavorites() {
            try {
                setLoadingFavorites(true);
                setFavoritesError("");
                
                const data = await getFavorites();
                setFavorites(data);
            } catch (error) {
                console.error(error);
                setFavoritesError("Failed to load favorite movies.");
            } finally {
                setLoadingFavorites(false);
            }
        }
        loadProfile();
        loadFavorites();
    }, []);

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
        const { name, value } = event.target;

        setProfile( (prev) => ({
            ...prev,
            [name]: value,
        }));
    }

    async function handleSave(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        
        try {
            setSaving(true);
            setSaveMessage("");
            setProfileError("");

            const response = await updateProfile({
                firstName: profile.firstName,
                lastName: profile.lastName,
                phone: profile.phone,
            });

            if (response.profile) {
                setProfile(response.profile);
            }

            setSaveMessage(response.message || "Profile updated successfully.");
        } catch (error) {
            console.error(error);
            setProfileError(
                error instanceof Error ? error.message : "Failed to update profile."
            );
        } finally {
            setSaving(false);
        }
    }

    async function handleRemoveFavorite(movieId: number) {
        try {
            await removeFavorite(movieId);
            
            setFavorites((prev) => prev.filter((movie) => movie.id !== movieId));
        } catch (error) {
            console.error(error);
            setFavoritesError(
                error instanceof Error ? error.message : "Failed to remove favorite movie."
            );
        }
    }

    function formatCardNumber(value: string) {
        const digitsOnly = value.replace(/\D/g, "").slice(0, 16);
        const groups = digitsOnly.match(/.{1,4}/g);
        return groups ? groups.join(" ") : "";
    }

    function maskCardNumber(value: string) {
        const digitsOnly = value.replace(/\D/g, "");
        const lastFour = digitsOnly.slice(-4);
        return `**** **** **** ${lastFour}`;
    }

    function handlAddPaymentMethod(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPaymentError("");

        if (paymentMethods.length >= 3) {
            setPaymentError("You can store a maximum of 3 payment cards.");
            return;
        }

        if (!newCardHolderName.trim() || !newCardNumber.trim() || !newExpiry.trim()) {
            setPaymentError("Please complete all payment card fields.");
            return;
        }
        const digitsOnly = newCardNumber.replace(/\D/g, "");
        if (digitsOnly.length !== 16) {
            setPaymentError("Card number must be 16 digits.");
            return;
        }

        const newCard: PaymentMethod = {
            id: Date.now(),
            cardHolderName: newCardHolderName.trim(),
            cardNumber: maskCardNumber(newCardNumber.trim()),
            expiry: newExpiry.trim(),
        };

        setPaymentMethods((prev) => [...prev, newCard]);
        setNewCardHolderName("");
        setNewCardNumber("");
        setNewExpiry("");
    }

    function handleRemovePaymentMethod(id: number) {
        setPaymentMethods((prev) => prev.filter((card) => card.id !== id));
        setPaymentError("");
    }
 
    if (loadingProfile) {
        return <p style={{padding: "24px"}}>Loading Profile...</p>;
    }

    return (
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "24px"}}>
            <h1 style={{ marginBottom: "24px"}}>My Profile</h1>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "32px" }}>
                <section style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "24px",}}>
                    <h2 style={{ marginTop: 0 }}>Profile Information</h2>

                    {profileError && <p style={{ color: "crimson", marginBottom: "16px"}}>{profileError}</p>}

                    {saveMessage && <p style={{ color: "green", marginBottom: "16px"}}>{saveMessage}</p>}

                    <form onSubmit={handleSave}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px"}}>
                            <div>
                                <label htmlFor="firstName" style={{ display: "block", marginBottom: "8px"}}>
                                    First Name
                                </label>
                                <input 
                                    id="firstName" 
                                    name="firstName" 
                                    type="text" 
                                    value={profile.firstName} 
                                    onChange={handleChange} 
                                    required
                                    style={{ width: "250px", padding: "10px", borderRadius: "8px", border: "1px solid #ccc"}} 
                                />
                            </div>
                            <div>
                                <label htmlFor="lastName" style={{ display: "block", marginBottom:"8px"}}>
                                    Last Name
                                </label>
                                <input
                                    id="lastName"
                                    name="lastName"
                                    type="text"
                                    value={profile.lastName}
                                    onChange={handleChange}
                                    required
                                    style={{ width: "250px", padding: "10px", borderRadius: "8px", border: "1px solid #ccc"}}
                                />
                            </div>
                            <div>
                                <label htmlFor="email" style={{ display: "block", marginBottom: "8px" }}>
                                Email
                                </label>
                                <input
                                id="email"
                                name="email"
                                type="email"
                                value={profile.email}
                                disabled
                                style={{
                                    width: "250px",
                                    padding: "10px",
                                    borderRadius: "8px",
                                    backgroundColor: "#f5f5f5",
                                    color: "#666",
                                }}
                                />
                            </div>
                            <div>
                                <label htmlFor="phone" style={{ display: "block", marginBottom: "8px" }}>
                                Phone
                                </label>
                                <input
                                id="phone"
                                name="phone"
                                type="text"
                                value={profile.phone}
                                onChange={handleChange}
                                style={{
                                    width: "250px",
                                    padding: "10px",
                                    borderRadius: "8px",
                                    border: "1px solid #ccc",
                                }}
                                />
                            </div>
                        </div>
                        <button type="submit" disabled={saving} 
                            style={{ display: "block", margin: "0 auto", marginTop: "15px",border: "none", borderRadius: "8px"}}>
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                    </form>
                </section>

                <section style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "24px",}}>
                    <h2 style={{ marginBottom: "16px"}}>Stored Payment Methods</h2>

                    {paymentError && <p>{paymentError}</p>}
                    {paymentMethods.length === 0 ? (
                        <p>No payment methods saved yet.</p>
                    ) : (
                        <div style={{ display: "flex", justifyContent: "center", marginBottom: "15px", alignItems: "center"}}>{paymentMethods.map((card) => (
                            <div key={card.id} style={{border: "1px solid #ddd", borderRadius: "10px", padding: "20px"}}>
                                <p><strong> {card.cardHolderName}</strong></p>
                                <p>{card.cardNumber}</p>
                                <p> Expires: {card.expiry}</p>

                                <button type="button" onClick={() => handleRemovePaymentMethod(card.id)}>Remove Card</button>
                            </div>
                        ))}
                        </div>
                    )}

                    <form onSubmit={handlAddPaymentMethod}>
                        <div>
                            <h4 style={{ marginBottom: "10px"}}>New Payment Method:</h4>
                            <label htmlFor="cardHolderName">Cardholder Name:  </label>
                            <input id="cardHolderName" type="text" value={newCardHolderName} onChange={(e) => setNewCardHolderName(e.target.value)} 
                                placeholder="Enter cardholder name"/>
                        </div>

                        <div>
                            <label htmlFor="cardNumber">Card Number:  </label>
                            <input id="cardNumber" type="text" value={newCardNumber} onChange={(e) => setNewCardNumber(formatCardNumber(e.target.value))}
                                placeholder="1234 5678 9012 3456" />
                        </div>

                        <div>
                            <label htmlFor="expiry">Expiration Date:  </label>
                            <input id="expiry" type="text" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)}
                                placeholder="MM/YY" /> 
                        </div>

                        <button style={{marginTop: "20px"}} type="submit" disabled={paymentMethods.length >= 3}>Add Payment Method</button>
                    </form>
                    <p style={{ marginBottom: "5px"}}>You may store up to 3 payment cards</p>
                </section>
                <section style={{ border: "1fr solid #ddd", borderRadius: "12px", padding: "24px"}}>
                    <h2 style={{ marginTop: 0}}>Favorite Movies</h2>
                    {loadingFavoites && <p>Loading favorite movies...</p>}
                    {favoritesError && (
                        <p style={{ color: "crimson"}}>{favoritesError}</p>
                    )}

                    {!loadingFavoites && !favoritesError && favorites.length === 0 && (
                        <p>You do not have any favorite movies selected.</p>
                    )}
                    {!loadingFavoites && !favoritesError && favorites.length > 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: "retpeat(auto-fit, minmax(220px, 1fr))", gap: "20px"}}>
                            {favorites.map((movie) => (
                                <div key={movie.id} style={{border: " 1px solid #ccc", borderRadius: "12px", padding: "16px"}}>
                                    <img src={movie.posterUrl}
                                        alt={movie.title}
                                        style={{
                                        width: "100%",
                                        height: "320px",
                                        objectFit: "cover",
                                        borderRadius: "8px",
                                        marginBottom: "12px",
                                        }}
                                    />
                                    <h3 style={{ margin: "0 0 8px"}}>{movie.title}</h3>
                                    <p style={{ margin: "0 0 4px"}}>
                                        <strong>Genre:</strong> {movie.genre} 
                                    </p>
                                    <p style={{ margin: "0 0 12px" }}>
                                        <strong>Rating:</strong> {movie.rating}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveFavorite(movie.id)}
                                        style={{ padding: "8px 14px", border: "none", borderRadius: "8px"}}>
                                        Remove from Favorites
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}