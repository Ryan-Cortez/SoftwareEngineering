import { useEffect, useState } from "react";
import {
    getProfile,
    updateProfile,
    addPaymentCard,
    getPaymentCard,
    updatePaymentCard,
    deletePaymentCard,
    type UserProfile,
    type Address,
} from "../api/profileApi";
import { getFavorites, removeFavorite } from "../api/favorites";
import type { Movie } from "../api/cinemaApi";

const MAX_CARDS = 3;

function formatMaskedCardDisplay(cardNumber: string): string {
    const digits = (cardNumber || "").replace(/\D/g, "");
    if (digits.length >= 4) return `${"*".repeat(12)}${digits.slice(-4)}`;
    return "*".repeat(12);
}

function formatExpMMYY(isoDate: string): string {
    // backend stores YYYY-MM-DD (date). Display should be MM/YY.
    const s = (isoDate || "").trim();
    if (s.length >= 7) {
        const yyyy = s.slice(0, 4);
        const mm = s.slice(5, 7);
        if (/^\d{4}$/.test(yyyy) && /^\d{2}$/.test(mm)) return `${mm}/${yyyy.slice(2)}`;
    }
    return "";
}

function parseExpMMYYToISO(mmYY: string): string {
    // Accept MM/YY or MMYY and convert to YYYY-MM-01 (backend accepts YYYY-MM-DD).
    const raw = (mmYY || "").trim();
    const m = raw.match(/^(\d{2})\s*\/?\s*(\d{2})$/);
    if (!m) return "";
    const mm = Number(m[1]);
    const yy = Number(m[2]);
    if (mm < 1 || mm > 12) return "";
    const yyyy = 2000 + yy;
    return `${String(yyyy)}-${String(mm).padStart(2, "0")}-01`;
}

export default function Profile() {
    const [profile, setProfile] = useState<UserProfile>({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        address: null,
        payment_cards: [],
    });

    const [address, setAddress] = useState<Address>({
        street: "",
        city: "",
        state: "",
        zip_code: "",
    });

    const [favorites, setFavorites] = useState<Movie[]>([]);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");

    const [newCard, setNewCard] = useState({
        card_number: "",
        expiration_mm_yy: "",
        billing_street: "",
        billing_city: "",
        billing_state: "",
        billing_zip_code: "",
    });

    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingFavorites, setLoadingFavorites] = useState(true);

    const [saving, setSaving] = useState(false);
    const [cardSaving, setCardSaving] = useState(false);
    const [editingCardId, setEditingCardId] = useState<number | null>(null);
    const [editCard, setEditCard] = useState<{
        card_number: string;
        expiration_date: string;
        billing_street: string;
        billing_city: string;
        billing_state: string;
        billing_zip_code: string;
        billing_apt?: string;
    } | null>(null);
    const [editCardSaving, setEditCardSaving] = useState(false);
    const [editCardError, setEditCardError] = useState("");

    const [profileError, setProfileError] = useState("");
    const [favoritesError, setFavoritesError] = useState("");
    const [saveMessage, setSaveMessage] = useState("");
    const [passwordError, setPasswordError] = useState("");

    async function reloadProfile() {
        const data = await getProfile();
        setProfile(data);
        if (data.address) {
            setAddress({
                street: data.address.street,
                city: data.address.city,
                state: data.address.state,
                zip_code: data.address.zip_code,
            });
        } else {
            setAddress({ street: "", city: "", state: "", zip_code: "" });
        }
    }

    useEffect(() => {
        async function loadProfile() {
            try {
                setLoadingProfile(true);
                setProfileError("");
                await reloadProfile();
            } catch (error) {
                console.error(error);
                setProfileError("Failed to load profile.");
            } finally {
                setLoadingProfile(false);
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

        setProfile((prev) => ({
            ...prev,
            [name]: value,
        }));
    }

    function handleAddressChange(event: React.ChangeEvent<HTMLInputElement>) {
        const { name, value } = event.target;
        setAddress((prev) => ({ ...prev, [name]: value }));
    }

    async function handleSave(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        try {
            setSaving(true);
            setSaveMessage("");
            setProfileError("");
            setPasswordError("");

            if (newPassword || confirmNewPassword || currentPassword) {
                if (!currentPassword) {
                    setPasswordError("Enter your current password to change it.");
                    return;
                }
                if (newPassword.length < 8) {
                    setPasswordError("New password must be at least 8 characters.");
                    return;
                }
                if (newPassword !== confirmNewPassword) {
                    setPasswordError("New passwords do not match.");
                    return;
                }
            }

            const payload: Parameters<typeof updateProfile>[0] = {
                firstName: profile.firstName,
                lastName: profile.lastName,
                phone: profile.phone,
                address,
            };

            if (newPassword && currentPassword) {
                payload.current_password = currentPassword;
                payload.new_password = newPassword;
            }

            const response = await updateProfile(payload);

            if (response.profile) {
                setProfile((prev) => ({ ...prev, ...response.profile }));
            }
            await reloadProfile();

            setSaveMessage(response.message || "Profile updated successfully.");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmNewPassword("");
        } catch (error) {
            console.error(error);
            setProfileError(
                error instanceof Error ? error.message : "Failed to update profile."
            );
        } finally {
            setSaving(false);
        }
    }

    async function handleAddCard(e: React.FormEvent) {
        e.preventDefault();
        if (profile.payment_cards.length >= MAX_CARDS) return;

        try {
            setCardSaving(true);
            setProfileError("");
            setSaveMessage("");

            const expIso = parseExpMMYYToISO(newCard.expiration_mm_yy);
            if (!expIso) {
                setProfileError("Expiration must be MM/YY (example: 12/28).");
                return;
            }

            await addPaymentCard({
                card_number: newCard.card_number.replace(/\s/g, ""),
                expiration_date: expIso,
                billing_street: newCard.billing_street,
                billing_city: newCard.billing_city,
                billing_state: newCard.billing_state.slice(0, 2),
                billing_zip_code: newCard.billing_zip_code,
            });
            await reloadProfile();
            setNewCard({
                card_number: "",
                expiration_mm_yy: "",
                billing_street: "",
                billing_city: "",
                billing_state: "",
                billing_zip_code: "",
            });
            setSaveMessage("Payment card added.");
        } catch (error) {
            setProfileError(
                error instanceof Error ? error.message : "Could not add card."
            );
        } finally {
            setCardSaving(false);
        }
    }

    async function handleDeleteCard(cardId: number) {
        try {
            setProfileError("");
            await deletePaymentCard(cardId);
            await reloadProfile();
            setSaveMessage("Card removed.");
        } catch (error) {
            setProfileError(
                error instanceof Error ? error.message : "Could not remove card."
            );
        }
    }

    async function handleEditCard(cardId: number) {
        try {
            setEditCardError("");
            setEditingCardId(cardId);
            setEditCard(null);
            const full = await getPaymentCard(cardId);
            setEditCard({
                card_number: full.card_number ?? "",
                expiration_date: full.expiration_date ?? "",
                billing_street: full.billing_street ?? "",
                billing_city: full.billing_city ?? "",
                billing_state: full.billing_state ?? "",
                billing_zip_code: full.billing_zip_code ?? "",
                billing_apt: full.billing_apt ?? "",
            });
        } catch (error) {
            setEditCardError(error instanceof Error ? error.message : "Could not load card details.");
            setEditingCardId(null);
            setEditCard(null);
        }
    }

    async function handleSaveEditedCard(e: React.FormEvent) {
        e.preventDefault();
        if (!editingCardId || !editCard) return;

        try {
            setEditCardSaving(true);
            setEditCardError("");
            setProfileError("");

            await updatePaymentCard(editingCardId, {
                card_number: editCard.card_number.replace(/\s/g, ""),
                expiration_date: editCard.expiration_date,
                billing_street: editCard.billing_street,
                billing_city: editCard.billing_city,
                billing_state: editCard.billing_state.slice(0, 2),
                billing_zip_code: editCard.billing_zip_code,
                billing_apt: editCard.billing_apt,
            });
            await reloadProfile();
            setSaveMessage("Card updated. We emailed you to confirm the change.");
            setEditingCardId(null);
            setEditCard(null);
        } catch (error) {
            setEditCardError(error instanceof Error ? error.message : "Could not update card.");
        } finally {
            setEditCardSaving(false);
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

    if (loadingProfile) {
        return <p style={{ padding: "24px" }}>Loading Profile...</p>;
    }

    return (
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "24px" }}>
            <h1 style={{ marginBottom: "24px" }}>My Profile</h1>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "32px" }}>
                <section
                    style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "24px" }}
                >
                    <h2 style={{ marginTop: 0 }}>Profile Information</h2>

                    {profileError && (
                        <p style={{ color: "crimson", marginBottom: "16px" }}>{profileError}</p>
                    )}

                    {saveMessage && (
                        <p style={{ color: "green", marginBottom: "16px" }}>{saveMessage}</p>
                    )}

                    <form onSubmit={handleSave}>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "16px",
                            }}
                        >
                            <div>
                                <label
                                    htmlFor="firstName"
                                    style={{ display: "block", marginBottom: "8px" }}
                                >
                                    First Name
                                </label>
                                <input
                                    id="firstName"
                                    name="firstName"
                                    type="text"
                                    value={profile.firstName}
                                    onChange={handleChange}
                                    required
                                    style={{
                                        width: "100%",
                                        padding: "10px",
                                        borderRadius: "8px",
                                        border: "1px solid #ccc",
                                    }}
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="lastName"
                                    style={{ display: "block", marginBottom: "8px" }}
                                >
                                    Last Name
                                </label>
                                <input
                                    id="lastName"
                                    name="lastName"
                                    type="text"
                                    value={profile.lastName}
                                    onChange={handleChange}
                                    required
                                    style={{
                                        width: "100%",
                                        padding: "10px",
                                        borderRadius: "8px",
                                        border: "1px solid #ccc",
                                    }}
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="email"
                                    style={{ display: "block", marginBottom: "8px" }}
                                >
                                    Email
                                </label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    value={profile.email}
                                    disabled
                                    style={{
                                        width: "100%",
                                        padding: "10px",
                                        borderRadius: "8px",
                                        border: "1px solid #ccc",
                                        backgroundColor: "#f5f5f5",
                                        color: "#666",
                                    }}
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="phone"
                                    style={{ display: "block", marginBottom: "8px" }}
                                >
                                    Phone
                                </label>
                                <input
                                    id="phone"
                                    name="phone"
                                    type="text"
                                    value={profile.phone}
                                    onChange={handleChange}
                                    style={{
                                        width: "100%",
                                        padding: "10px",
                                        borderRadius: "8px",
                                        border: "1px solid #ccc",
                                    }}
                                />
                            </div>
                        </div>

                        <h3 style={{ marginTop: "24px" }}>Address (max one)</h3>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "16px",
                            }}
                        >
                            <div style={{ gridColumn: "1 / -1" }}>
                                <label htmlFor="street">Street</label>
                                <input
                                    id="street"
                                    name="street"
                                    value={address.street}
                                    onChange={handleAddressChange}
                                    style={{
                                        width: "100%",
                                        padding: "10px",
                                        borderRadius: "8px",
                                        border: "1px solid #ccc",
                                    }}
                                />
                            </div>
                            <div>
                                <label htmlFor="city">City</label>
                                <input
                                    id="city"
                                    name="city"
                                    value={address.city}
                                    onChange={handleAddressChange}
                                    style={{
                                        width: "100%",
                                        padding: "10px",
                                        borderRadius: "8px",
                                        border: "1px solid #ccc",
                                    }}
                                />
                            </div>
                            <div>
                                <label htmlFor="state">State</label>
                                <input
                                    id="state"
                                    name="state"
                                    value={address.state}
                                    onChange={handleAddressChange}
                                    style={{
                                        width: "100%",
                                        padding: "10px",
                                        borderRadius: "8px",
                                        border: "1px solid #ccc",
                                    }}
                                />
                            </div>
                            <div style={{ gridColumn: "1 / -1" }}>
                                <label htmlFor="zip_code">ZIP</label>
                                <input
                                    id="zip_code"
                                    name="zip_code"
                                    value={address.zip_code}
                                    onChange={handleAddressChange}
                                    style={{
                                        width: "100%",
                                        padding: "10px",
                                        borderRadius: "8px",
                                        border: "1px solid #ccc",
                                    }}
                                />
                            </div>
                        </div>

                        <h3 style={{ marginTop: "24px" }}>Change password</h3>
                        {passwordError && (
                            <p style={{ color: "crimson" }}>{passwordError}</p>
                        )}
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "16px",
                            }}
                        >
                            <div>
                                <label htmlFor="currentPassword">Current password</label>
                                <input
                                    id="currentPassword"
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    autoComplete="current-password"
                                    style={{
                                        width: "100%",
                                        padding: "10px",
                                        borderRadius: "8px",
                                        border: "1px solid #ccc",
                                    }}
                                />
                            </div>
                            <div />
                            <div>
                                <label htmlFor="newPassword">New password</label>
                                <input
                                    id="newPassword"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    autoComplete="new-password"
                                    style={{
                                        width: "100%",
                                        padding: "10px",
                                        borderRadius: "8px",
                                        border: "1px solid #ccc",
                                    }}
                                />
                            </div>
                            <div>
                                <label htmlFor="confirmNewPassword">Confirm new password</label>
                                <input
                                    id="confirmNewPassword"
                                    type="password"
                                    value={confirmNewPassword}
                                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                                    autoComplete="new-password"
                                    style={{
                                        width: "100%",
                                        padding: "10px",
                                        borderRadius: "8px",
                                        border: "1px solid #ccc",
                                    }}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={saving}
                            style={{
                                marginTop: "20px",
                                padding: "10px 18px",
                                border: "none",
                                borderRadius: "8px",
                                cursor: "pointer",
                            }}
                        >
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                    </form>
                </section>

                <section
                    style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "24px" }}
                >
                    <h2 style={{ marginTop: 0 }}>Payment cards (max {MAX_CARDS})</h2>
                    <p style={{ marginTop: 0, color: "#555" }}>
                        Card numbers are stored encrypted on the server. Only a masked value is shown here.
                    </p>

                    {profileError && (
                        <p style={{ color: "crimson", marginBottom: "16px" }}>{profileError}</p>
                    )}

                    {saveMessage && (
                        <p style={{ color: "green", marginBottom: "16px" }}>{saveMessage}</p>
                    )}

                    <ul style={{ listStyle: "none", padding: 0 }}>
                        {profile.payment_cards.map((c) => (
                            <li
                                key={c.card_id}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "12px 0",
                                    borderBottom: "1px solid #eee",
                                }}
                            >
                                <div style={{ flex: 1 }}>
                                    <div>
                                        {formatMaskedCardDisplay(c.card_number)} · exp{" "}
                                        {formatExpMMYY(c.expiration_date)}
                                    </div>

                                    {editingCardId === c.card_id && (
                                        <div style={{ marginTop: "12px" }}>
                                            {editCardError && (
                                                <p style={{ color: "crimson", margin: "0 0 8px" }}>
                                                    {editCardError}
                                                </p>
                                            )}
                                            {!editCard && !editCardError && (
                                                <p style={{ margin: 0, color: "#555" }}>Loading card details…</p>
                                            )}

                                            {editCard && (
                                                <form onSubmit={handleSaveEditedCard}>
                                                    <div
                                                        style={{
                                                            display: "grid",
                                                            gridTemplateColumns: "1fr 1fr",
                                                            gap: "12px",
                                                        }}
                                                    >
                                                        <div style={{ gridColumn: "1 / -1" }}>
                                                            <label>Full card number</label>
                                                            <input
                                                                required
                                                                value={editCard.card_number}
                                                                onChange={(e) =>
                                                                    setEditCard((p) =>
                                                                        p ? { ...p, card_number: e.target.value } : p
                                                                    )
                                                                }
                                                                style={{
                                                                    width: "100%",
                                                                    padding: "10px",
                                                                    borderRadius: "8px",
                                                                    border: "1px solid #ccc",
                                                                }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label>Expiration (YYYY-MM-DD)</label>
                                                            <input
                                                                required
                                                                value={editCard.expiration_date}
                                                                onChange={(e) =>
                                                                    setEditCard((p) =>
                                                                        p
                                                                            ? { ...p, expiration_date: e.target.value }
                                                                            : p
                                                                    )
                                                                }
                                                                style={{
                                                                    width: "100%",
                                                                    padding: "10px",
                                                                    borderRadius: "8px",
                                                                    border: "1px solid #ccc",
                                                                }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label>Billing ZIP</label>
                                                            <input
                                                                required
                                                                value={editCard.billing_zip_code}
                                                                onChange={(e) =>
                                                                    setEditCard((p) =>
                                                                        p
                                                                            ? { ...p, billing_zip_code: e.target.value }
                                                                            : p
                                                                    )
                                                                }
                                                                style={{
                                                                    width: "100%",
                                                                    padding: "10px",
                                                                    borderRadius: "8px",
                                                                    border: "1px solid #ccc",
                                                                }}
                                                            />
                                                        </div>
                                                        <div style={{ gridColumn: "1 / -1" }}>
                                                            <label>Street</label>
                                                            <input
                                                                required
                                                                value={editCard.billing_street}
                                                                onChange={(e) =>
                                                                    setEditCard((p) =>
                                                                        p
                                                                            ? { ...p, billing_street: e.target.value }
                                                                            : p
                                                                    )
                                                                }
                                                                style={{
                                                                    width: "100%",
                                                                    padding: "10px",
                                                                    borderRadius: "8px",
                                                                    border: "1px solid #ccc",
                                                                }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label>City</label>
                                                            <input
                                                                required
                                                                value={editCard.billing_city}
                                                                onChange={(e) =>
                                                                    setEditCard((p) =>
                                                                        p
                                                                            ? { ...p, billing_city: e.target.value }
                                                                            : p
                                                                    )
                                                                }
                                                                style={{
                                                                    width: "100%",
                                                                    padding: "10px",
                                                                    borderRadius: "8px",
                                                                    border: "1px solid #ccc",
                                                                }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label>State (2 letters)</label>
                                                            <input
                                                                required
                                                                maxLength={2}
                                                                value={editCard.billing_state}
                                                                onChange={(e) =>
                                                                    setEditCard((p) =>
                                                                        p
                                                                            ? {
                                                                                  ...p,
                                                                                  billing_state: e.target.value.toUpperCase(),
                                                                              }
                                                                            : p
                                                                    )
                                                                }
                                                                style={{
                                                                    width: "100%",
                                                                    padding: "10px",
                                                                    borderRadius: "8px",
                                                                    border: "1px solid #ccc",
                                                                }}
                                                            />
                                                        </div>
                                                        <div style={{ gridColumn: "1 / -1" }}>
                                                            <label>Apt/Suite (optional)</label>
                                                            <input
                                                                value={editCard.billing_apt ?? ""}
                                                                onChange={(e) =>
                                                                    setEditCard((p) =>
                                                                        p ? { ...p, billing_apt: e.target.value } : p
                                                                    )
                                                                }
                                                                style={{
                                                                    width: "100%",
                                                                    padding: "10px",
                                                                    borderRadius: "8px",
                                                                    border: "1px solid #ccc",
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                                                        <button
                                                            type="submit"
                                                            disabled={editCardSaving}
                                                            style={{
                                                                padding: "8px 14px",
                                                                borderRadius: "8px",
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            {editCardSaving ? "Saving…" : "Save"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingCardId(null);
                                                                setEditCard(null);
                                                                setEditCardError("");
                                                            }}
                                                            disabled={editCardSaving}
                                                            style={{
                                                                padding: "8px 14px",
                                                                borderRadius: "8px",
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </form>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {editingCardId !== c.card_id && (
                                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                        <button
                                            type="button"
                                            onClick={() => handleEditCard(c.card_id)}
                                            style={{
                                                padding: "8px 14px",
                                                borderRadius: "8px",
                                                cursor: "pointer",
                                            }}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteCard(c.card_id)}
                                            style={{
                                                padding: "8px 14px",
                                                borderRadius: "8px",
                                                cursor: "pointer",
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>

                    {profile.payment_cards.length < MAX_CARDS && (
                        <form onSubmit={handleAddCard} style={{ marginTop: "16px" }}>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "12px",
                                }}
                            >
                                <div style={{ gridColumn: "1 / -1" }}>
                                    <label>Card number</label>
                                    <input
                                        required
                                        value={newCard.card_number}
                                        onChange={(e) =>
                                            setNewCard((p) => ({ ...p, card_number: e.target.value }))
                                        }
                                        placeholder="16 digits"
                                        style={{
                                            width: "100%",
                                            padding: "10px",
                                            borderRadius: "8px",
                                            border: "1px solid #ccc",
                                        }}
                                    />
                                </div>
                                <div>
                                    <label>Expiration (MM/YY)</label>
                                    <input
                                        required
                                        type="text"
                                        value={newCard.expiration_mm_yy}
                                        onChange={(e) =>
                                            setNewCard((p) => ({ ...p, expiration_mm_yy: e.target.value }))
                                        }
                                        placeholder="12/28"
                                        style={{
                                            width: "100%",
                                            padding: "10px",
                                            borderRadius: "8px",
                                            border: "1px solid #ccc",
                                        }}
                                    />
                                </div>
                                <div>
                                    <label>Billing ZIP</label>
                                    <input
                                        required
                                        value={newCard.billing_zip_code}
                                        onChange={(e) =>
                                            setNewCard((p) => ({ ...p, billing_zip_code: e.target.value }))
                                        }
                                        style={{
                                            width: "100%",
                                            padding: "10px",
                                            borderRadius: "8px",
                                            border: "1px solid #ccc",
                                        }}
                                    />
                                </div>
                                <div style={{ gridColumn: "1 / -1" }}>
                                    <label>Street</label>
                                    <input
                                        required
                                        value={newCard.billing_street}
                                        onChange={(e) =>
                                            setNewCard((p) => ({ ...p, billing_street: e.target.value }))
                                        }
                                        style={{
                                            width: "100%",
                                            padding: "10px",
                                            borderRadius: "8px",
                                            border: "1px solid #ccc",
                                        }}
                                    />
                                </div>
                                <div>
                                    <label>City</label>
                                    <input
                                        required
                                        value={newCard.billing_city}
                                        onChange={(e) =>
                                            setNewCard((p) => ({ ...p, billing_city: e.target.value }))
                                        }
                                        style={{
                                            width: "100%",
                                            padding: "10px",
                                            borderRadius: "8px",
                                            border: "1px solid #ccc",
                                        }}
                                    />
                                </div>
                                <div>
                                    <label>State (2 letters)</label>
                                    <input
                                        required
                                        maxLength={2}
                                        value={newCard.billing_state}
                                        onChange={(e) =>
                                            setNewCard((p) => ({
                                                ...p,
                                                billing_state: e.target.value.toUpperCase(),
                                            }))
                                        }
                                        style={{
                                            width: "100%",
                                            padding: "10px",
                                            borderRadius: "8px",
                                            border: "1px solid #ccc",
                                        }}
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={cardSaving}
                                style={{
                                    marginTop: "12px",
                                    padding: "10px 18px",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                }}
                            >
                                {cardSaving ? "Adding…" : "Add card"}
                            </button>
                        </form>
                    )}
                </section>

                <section
                    style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "24px" }}
                >
                    <h2 style={{ marginTop: 0 }}>Favorite Movies</h2>
                    {loadingFavorites && <p>Loading favorite movies...</p>}
                    {favoritesError && <p style={{ color: "crimson" }}>{favoritesError}</p>}

                    {!loadingFavorites && !favoritesError && favorites.length === 0 && (
                        <p>You do not have any favorite movies selected.</p>
                    )}
                    {!loadingFavorites && !favoritesError && favorites.length > 0 && (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                gap: "20px",
                            }}
                        >
                            {favorites.map((movie) => (
                                <div
                                    key={movie.id}
                                    style={{
                                        border: "1px solid #ccc",
                                        borderRadius: "12px",
                                        padding: "16px",
                                    }}
                                >
                                    <img
                                        src={movie.posterUrl}
                                        alt={movie.title}
                                        style={{
                                            width: "100%",
                                            height: "320px",
                                            objectFit: "cover",
                                            borderRadius: "8px",
                                            marginBottom: "12px",
                                        }}
                                    />
                                    <h3 style={{ margin: "0 0 8px" }}>{movie.title}</h3>
                                    <p style={{ margin: "0 0 4px" }}>
                                        <strong>Genre:</strong> {movie.genre}
                                    </p>
                                    <p style={{ margin: "0 0 12px" }}>
                                        <strong>Rating:</strong> {movie.rating}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveFavorite(movie.id)}
                                        style={{
                                            padding: "8px 14px",
                                            border: "none",
                                            borderRadius: "8px",
                                            cursor: "pointer",
                                        }}
                                    >
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
