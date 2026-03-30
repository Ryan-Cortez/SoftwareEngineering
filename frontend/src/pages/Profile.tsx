import { useEffect, useState } from "react";
import { getProfile, updateProfile, type UserProfile } from "../api/profileApi";
import { getFavorites, removeFavorite } from "../api/favorites";
import type { Movie } from "../api/cinemaApi";

export default function Profile() {
    const [profile, setProfile] = useState<UserProfile>({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
    });

    const [favorites, setFavorites] = useState<Movie[]>([]);

    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingFavoites, setLoadingFavorites] = useState(true);
 
    const [saving, setSaving] = useState(false);

    const [profileError, setProfileError] = useState("");
    const [favoritesError, setFavoritesError] = useState("");
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

    if (loadingProfile) {
        return <p style={{padding: "24px"}}>Loading Profile...</p>;
    }

    return (
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "24px"}}>
            <h1 style={{ marginBottom: "24px"}}>My Profile</h1>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "32px" }}>
                <section style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "24px",}}>
                    <h2 style={{ marginTop: 0 }}>Profile Information</h2>

                    {profileError && (
                        <p style={{ color: "crimson", marginBottom: "16px"}}>
                            {profileError}
                        </p>
                    )}

                    {saveMessage && (
                        <p style={{ color: "green", marginBottom: "16px"}}>
                            {saveMessage}
                        </p>
                    )}

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
                                    style={{ width: "100px", padding: "10px", borderRadius: "8px", border: "1px solid #ccc"}} 
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
                                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ccc"}}
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
                                    width: "100%",
                                    padding: "10px",
                                    borderRadius: "8px",
                                    border: "1px solid #ccc",
                                }}
                                />
                            </div>
                        </div>
                        <button type="submit" disabled={saving} 
                            style={{ marginTop: "20px", padding: "10px 18px", border: "none", borderRadius: "8px", cursor: "pointer" }}>
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                    </form>
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
                                        style={{ padding: "8px 14px", border: "none", borderRadius: "8px", cursor: "pointer"}}>
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