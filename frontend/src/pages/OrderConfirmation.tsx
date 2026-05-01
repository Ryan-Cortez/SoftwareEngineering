import { Link, useLocation } from "react-router-dom";

type Ticket = {
  ticket_id: number;
  type: string;
  unit_price: number;
  seat_id: number;
};

type Booking = {
  booking_id: number;
  customer_id: number;
  show_id: number;
  card_id: number;
  booking_time: string;
  total_amount: number;
  booking_fee_amount: number;
  promotion_discount_amount: number;
};

type OrderState = {
  message?: string;
  booking?: Booking;
  tickets?: Ticket[];
};

export default function OrderConfirmation() {
  const location = useLocation();
  const state = location.state as OrderState | null;

  const booking = state?.booking;
  const tickets = state?.tickets ?? [];

  if (!booking) {
    return (
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px" }}>
        <h1>Order Confirmation</h1>
        <p>No order information was found.</p>
        <Link to="/">Return Home</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px" }}>
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Order Confirmed!</h1>

        <p style={{ color: "green", fontWeight: "bold" }}>
          {state?.message || "Your booking has been created."}
        </p>

        <h2>Booking Details</h2>

        <p>
          <strong>Booking ID:</strong> {booking.booking_id}
        </p>

        <p>
          <strong>Show ID:</strong> {booking.show_id}
        </p>

        <p>
          <strong>Booking Time:</strong>{" "}
          {new Date(booking.booking_time).toLocaleString()}
        </p>

        <p>
          <strong>Card Used:</strong> Card #{booking.card_id}
        </p>

        <h2>Tickets</h2>

        {tickets.length === 0 ? (
          <p>No tickets were returned for this booking.</p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: "12px",
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Ticket ID</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Seat ID</th>
                <th style={thStyle}>Price</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.ticket_id}>
                  <td style={tdStyle}>{ticket.ticket_id}</td>
                  <td style={tdStyle}>{ticket.type}</td>
                  <td style={tdStyle}>{ticket.seat_id}</td>
                  <td style={tdStyle}>${ticket.unit_price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>Payment Summary</h2>

        <p>
          <strong>Booking Fee:</strong> ${booking.booking_fee_amount.toFixed(2)}
        </p>

        <p>
          <strong>Promotion Discount:</strong> $
          {booking.promotion_discount_amount.toFixed(2)}
        </p>

        <p style={{ fontSize: "20px", fontWeight: "bold" }}>
          Total: ${booking.total_amount.toFixed(2)}
        </p>

        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          <Link to="/">
            <button style={buttonStyle}>Back to Home</button>
          </Link>

          <Link to="/profile">
            <button style={buttonStyle}>View Profile</button>
          </Link>
        </div>
      </section>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: "10px",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "10px",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: "8px",
  border: "1px solid #ccc",
  cursor: "pointer",
};