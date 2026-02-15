import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/login";
import Navbar from "./components/navbar";

export default function App() {
    return (
        <>
            <Navbar />
            <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
            </Routes>
        </>
    );
}
