import { render, screen } from "@testing-library/react";
import Profile from "../pages/Profile";

beforeEach(() => {
  localStorage.setItem(
    "currentUser",
    JSON.stringify({ name: "Nikhil", email: "xyreo@example.com" })
  );
});

test("renders Edit Profile heading", () => {
  render(<Profile />);
  expect(screen.getByText("Edit Profile")).toBeInTheDocument();
});
