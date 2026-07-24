import { BrowserRouter } from "react-router-dom"
import { AuthProvider } from "./AuthContext.jsx"
import Site from "../site_1.jsx"

// This file is just thin wiring.
// The entire actual website (all pages, components, styles, products, etc.)
// lives in the single file `site_1.jsx` at the project root.

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Site />
      </AuthProvider>
    </BrowserRouter>
  )
}
