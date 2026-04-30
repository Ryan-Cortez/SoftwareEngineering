import { useState } from "react";
import { Link } from "react-router-dom";
import { createPromotion, type PromotionDiscountType } from "../api/adminApi";

type PromotionForm = {
  code: string;
  description: string;
  discountType: PromotionDiscountType;
  discountValue: string;
  expirationDate: string;
};

export default function AddPromotionPage() {
  const [formData, setFormData] = useState<PromotionForm>({
    code: "",
    description: "",
    discountType: "Percent",
    discountValue: "",
    expirationDate: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function handleChange(
    event: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) {
    const { name, value } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (
      !formData.code ||
      !formData.discountType ||
      !formData.discountValue ||
      !formData.expirationDate
    ) {
      setError("Please fill out all required fields.");
      return;
    }

    const discountNumber = Number(formData.discountValue);

    if (Number.isNaN(discountNumber) || discountNumber < 0) {
      setError("Discount value must be 0 or greater.");
      return;
    }

    if (formData.discountType === "Percent" && discountNumber > 100) {
      setError("Percent discounts cannot be greater than 100.");
      return;
    }

    const promotionPayload = {
      code: formData.code,
      description: formData.description,
      discount_type: formData.discountType,
      discount_value: discountNumber,
      expiration_date: formData.expirationDate,
    };

    try {
      setSubmitting(true);

      await createPromotion(promotionPayload);

      setMessage("Promotion added successfully.");

      setFormData({
        code: "",
        description: "",
        discountType: "Percent",
        discountValue: "",
        expirationDate: "",
      });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Something went wrong while adding the promotion.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" style={{ maxWidth: "650px" }}>
        <h1 className="auth-title">Add Promotion</h1>

        <p className="auth-subtitle">
          Create a new promotion code for customer ticket discounts.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <p className="auth-error">{error}</p>}
          {message && <p className="auth-success">{message}</p>}

          <div className="auth-field">
            <label htmlFor="code">Promotion Code</label>
            <input
              id="code"
              name="code"
              type="text"
              placeholder="Example: SUMMER25"
              value={formData.code}
              onChange={handleChange}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              placeholder="Example: 25% off summer movie tickets"
              value={formData.description}
              onChange={handleChange}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="discountType">Discount Type</label>
            <select
              id="discountType"
              name="discountType"
              value={formData.discountType}
              onChange={handleChange}
            >
              <option value="Percent">Percent</option>
              <option value="Amount">Amount</option>
            </select>
          </div>

          <div className="auth-field">
            <label htmlFor="discountValue">
              {formData.discountType === "Percent"
                ? "Discount Percent"
                : "Discount Amount"}
            </label>
            <input
              id="discountValue"
              name="discountValue"
              type="number"
              min="0"
              step="0.01"
              placeholder={
                formData.discountType === "Percent"
                  ? "Example: 25"
                  : "Example: 5.00"
              }
              value={formData.discountValue}
              onChange={handleChange}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="expirationDate">Expiration Date</label>
            <input
              id="expirationDate"
              name="expirationDate"
              type="datetime-local"
              value={formData.expirationDate}
              onChange={handleChange}
            />
          </div>

          <button className="auth-button" type="submit" disabled={submitting}>
            {submitting ? "Adding Promotion..." : "Add Promotion"}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/admin/promotions">Back to Promotions</Link>
        </p>
      </section>
    </main>
  );
}