import React, { useState } from "react";
import api from "../utils/api";
import { uploadToCloudinary } from "../utils/uploadAvatar";

export default function Profile() {
  const storedUser = JSON.parse(localStorage.getItem("currentUser"));
  const token = localStorage.getItem("token");

  const [user, setUser] = useState(storedUser);
  const [name, setName] = useState(storedUser.name || "");
  const [email, setEmail] = useState(storedUser.email || "");
  const [avatar, setAvatar] = useState(storedUser.avatar_url || null);

  const [uploading, setUploading] = useState(false);
  const [oldPassword, setOldPass] = useState("");
  const [newPassword, setNewPass] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  /* ---------------------- Avatar Upload ---------------------- */
  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setMsg("");
      setError("");

      const res = await uploadToCloudinary(file);
      if (!res.secure_url) {
        setError("Failed to upload image.");
        return;
      }

      const imageUrl = res.secure_url;
      setAvatar(imageUrl);

      const updated = await api.put(
        "/api/user/avatar",
        { avatarUrl: imageUrl },
        token
      );

      localStorage.setItem("currentUser", JSON.stringify(updated));
      setUser(updated);
      setMsg("Profile photo updated!");
    } catch (err) {
      setError(err.message || "Failed to update avatar.");
    } finally {
      setUploading(false);
    }
  }

  /* ---------------------- Save Profile ---------------------- */
  async function saveProfile() {
    try {
      setMsg("");
      setError("");

      const updated = await api.put(
        "/api/user/profile",
        { name, email },
        token
      );

      localStorage.setItem("currentUser", JSON.stringify(updated));
      setUser(updated);
      setMsg("Profile updated!");
    } catch (err) {
      setError(err.message);
    }
  }

  /* ---------------------- Change Password ---------------------- */
  async function changePassword() {
    try {
      setMsg("");
      setError("");

      const updated = await api.put(
        "/api/user/password",
        { oldPassword, newPassword },
        token
      );

      if (updated.success) {
        setMsg("Password updated!");
        setOldPass("");
        setNewPass("");
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const avatarUrl =
    avatar || `https://api.dicebear.com/6.x/identicon/svg?seed=${user.email}`;

  return (
    <div className="profile-page-container">
      <div className="profile-card-ig">

        {/* ------------------------- Avatar ------------------------- */}
        <div className="profile-avatar-section">
          <label className="profile-avatar-wrapper">
            <img src={avatarUrl} className="profile-avatar-img" alt="avatar" />
            <div className="profile-avatar-overlay">Change</div>
            <input type="file" hidden accept="image/*" onChange={handleAvatarChange} />
          </label>
          {uploading && <p className="uploading-text">Uploading...</p>}
        </div>

        {/* ------------------------- Heading ------------------------- */}
        <h2 className="profile-heading">Edit Profile</h2>
        <p className="profile-subtitle">Update your name, email & avatar.</p>

        {/* ------------------------- Form ------------------------- */}
        <div className="profile-form">

          <label className="profile-label">Name</label>
          <input
            className="profile-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label className="profile-label">Email</label>
          <input
            className="profile-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <button className="profile-btn" onClick={saveProfile}>
            Save Changes
          </button>
        </div>

        {/* ---------------------- Password ---------------------- */}
        <h3 className="profile-section-title">Change Password</h3>

        <div className="profile-form">
          <input
            type="password"
            className="profile-input"
            placeholder="Old Password"
            value={oldPassword}
            onChange={(e) => setOldPass(e.target.value)}
          />

          <input
            type="password"
            className="profile-input"
            placeholder="New Password"
            value={newPassword}
            onChange={(e) => setNewPass(e.target.value)}
          />

          <button className="profile-btn" onClick={changePassword}>
            Update Password
          </button>
        </div>

        {/* ---------------------- Messages ---------------------- */}
        {msg && <p className="profile-success">{msg}</p>}
        {error && <p className="profile-error">{error}</p>}
      </div>
    </div>
  );
}
