import { useNavigate } from "react-router-dom";
import type { Movie } from "../api/cinemaApi";

export default function MovieCard({ movie }: { movie: Movie}) {
    const navigate = useNavigate();
    return (
        <button onClick={() => navigate(`/movies/$z{movie:id}`)}
        style={{    //this if the css for the button can be moved to global file
            display: "grid",
            gridTemplateRows: "108px, auto",
        }}
        >
            <div> 
                //poster part of card
                <img src={movie.posterUrl} alt={movie.title} />
            </div>
            <div>
                <div>{ movie.title }</div>
                <div>
                    { movie.genre } { movie.rating }
                </div>
                <div> { movie.description.length > 90 ? movie.description.slice(0, 90) + "..." : movie.description } </div>

            </div>
        </button>
    )
}