import { useEffect, useMemo, useState } from "react";
import MainCard from "../components/MainCard";
import { getMovies, type Movie } from "../api/cinemaApi";

export default function Search() {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState(" ");
    const [genre, setGenre] = useState(" ");
    const [showDate, setShowDate] = useState(" ");

    useEffect (() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
            try {

                const data = await getMovies(search, genre, showDate);
                if (!cancelled) setMovies(data);
            } catch (e) {
                if (!cancelled) setError("Could not load movies. Is the backend running?");

            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        const t = setTimeout(load, 250);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [search, genre, showDate]);

    const genreOptions = useMemo(() => {
        const set = new Set(movies.map((m) => m.genre).filter(Boolean));
        return Array.from(set).sort();
    }, [movies]);

    const gridStyle: React.CSSProperties = {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill)",
        gap: 16,
    };

    const hasFilters = search.trim() || genre.trim() || showDate.trim();

    return (
        <div className="page">
            <h1 className="movies-header">Browse Movies</h1>
            <header className="movies-header">
            <div>Search by Title, filter by genre, or filter by show date</div>
            <div 
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 220px 220px 120px",
                    gap: 12,
                    alignItems: "end",
                    marginBottom: 16,
            }}
        >
            <div>
                <label>Search Title </label>
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="e.g. Spider"
                />
            </div>
            <div>
                <label>Filter </label>
                <select
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                >
                    <option value="">All</option>
                    {genreOptions.map((g) => (
                        <option key={g} value={g}>
                            {g}
                    </option>
                    ))}
                    </select>
            </div>
            
            <button onClick={() => {
                setSearch(" ");
                setGenre(" ");
                setShowDate(" ");
            }}
            disabled={!hasFilters}
            >Clear</button>
            </div>
            </header>
            {loading && <div>Loading</div>}
            {error && <div>{error}</div>}

            {!loading && !error && movies.length === 0 && (
                <div>No movies matchyour search/filter criteria.</div>
            )}
            
            {!loading && !error && (
                <section className="movie-grid">
                  {movies.map((m) => (
                    <MainCard key={m.id} movie={m} />
                  ))}
                </section>
            )}
        </div>
    )
}