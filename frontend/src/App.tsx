import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import MovieDetails from "./pages/MovieDetails";
//import Booking from "./pages/Booking";
import Navbar from "./components/navbar";

export default function App() {
    return (
        <>
            <Navbar />
            <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/movies/:id" element={<MovieDetails />} />
                <Route path="/login" element={<Login />} />
            </Routes>
        </>
    );
}
