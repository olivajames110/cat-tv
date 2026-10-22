import "./App.css";
import CatEntertainmentApp from "./CatEntertainment.jsx";
import PlayerPage from "./remote/PlayerPage.jsx";
import AdminPage from "./remote/AdminPage.jsx";

function App() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/play") return <PlayerPage />;
  if (path === "/admin") return <AdminPage />;
  return <CatEntertainmentApp />;
}

export default App;
