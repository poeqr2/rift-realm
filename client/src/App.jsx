// /root/rift-realm/client/src/App.jsx
import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Profile from './pages/Profile.jsx';

function NavBar() {
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <span className="logo-icon">⚔️</span>
        <span className="logo-text">Rift Realm</span>
      </div>
      <ul className="navbar-links">
        <li>
          <NavLink
            to="/"
            end
            className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
          >
            Lobby
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/game"
            className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
          >
            Battle
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/leaderboard"
            className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
          >
            Leaderboard
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/profile"
            className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
          >
            Profile
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

export default function App() {
  return (
    <div className="app">
      <NavBar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/game" element={<Game />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
