import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MovieDetails from "./pages/MovieDetails";
import BookingPage from "./pages/Booking";
import SearchAndFilter from "./pages/SearchAndFilter"
import Navbar from "./components/navbar";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AdminPortal from "./pages/AdminPortal";
import Profile from "./pages/Profile";

export default function App() {
    return (
        <>
            <Navbar />
            <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/movies/:id" element={<MovieDetails />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/admin" element={<AdminPortal />} />
                <Route path="/search" element={<SearchAndFilter />} />
                <Route path="/booking" element={<BookingPage />} />
            </Routes>
        </>
    );
}
