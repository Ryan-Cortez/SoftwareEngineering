import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MovieDetails from "./pages/MovieDetails";
import BookingPage from "./pages/Booking";
import SearchAndFilter from "./pages/SearchAndFilter";
import Navbar from "./components/navbar";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";

import Profile from "./pages/Profile";
import SeatSelection from "./pages/SeatSelection";
import Checkout from "./pages/Checkout";
import Payment from "./pages/Payment";
// admin imports
import AdminPortal from "./pages/AdminPortal";
import AdminSection from "./pages/AdminSection";
import ManageMovies from "./pages/ManageMovies";
import AddMovie from "./pages/AddMovie";
import ManageShowtimes from "./pages/ManageShowtimes";
import AddShowtime from "./pages/AddShowtime";
import ManagePromotions from "./pages/ManagePromotions";
import ManageUsers from "./pages/ManageUsers";
import AddPromotion from "./pages/AddPromotion";
import MovieRecommendationsPage from "./pages/MovieRecommendationsPage";

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
                <Route path="/reset-password/:token" element={<ResetPassword />} />
                <Route path="/verify-email/:token" element={<VerifyEmail />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/admin" element={<AdminPortal />} />
                <Route path="/admin/:section" element={<AdminSection />} />
                <Route path="/search" element={<SearchAndFilter />} />

                <Route path="/booking" element={<BookingPage />} />
                <Route path="/seat-selection" element={<SeatSelection />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/payment" element={<Payment />} />

                <Route path="/admin/movies" element={<ManageMovies />} />
                <Route path="/admin/movies/add" element={<AddMovie />} />
                <Route path="/admin/showtimes" element={<ManageShowtimes />} />
                <Route path="/admin/showtimes/add" element={<AddShowtime />} />
                <Route path="/admin/promotions" element={<ManagePromotions />} />
                <Route path="/admin/users" element={<ManageUsers />} />
                <Route path="/admin/promotions/add" element={<AddPromotion />} />
                <Route path="/recommendations" element={<MovieRecommendationsPage />} />
            </Routes>
        </>
    );
}
