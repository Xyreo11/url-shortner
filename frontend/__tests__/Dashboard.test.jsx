import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "../pages/Dashboard";

beforeEach(() => {
  // minimal mock user
  localStorage.setItem(
    "currentUser",
    JSON.stringify({ email: "test@gmail.com", role: "user" })
  );
  localStorage.setItem("token", "dummy");
});

test("renders dashboard title", () => {
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );

  expect(screen.getByText("Analytics Dashboard")).toBeInTheDocument();
});
