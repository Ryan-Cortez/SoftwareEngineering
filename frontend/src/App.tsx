import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import MovieDetails from "./pages/MovieDetails";
import BookingPage from "./pages/Booking";
import SearchAndFilter from "./pages/SearchAndFilter"
import Navbar from "./components/navbar";

export default function App() {
    return (
        <>
            <Navbar />
            <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/movies/:id" element={<MovieDetails />} />
                <Route path="/login" element={<Login />} />
                <Route path="/search" element={<SearchAndFilter />} />
                <Route path="/booking" element={<BookingPage />} />
            </Routes>
        </>
    );
}
