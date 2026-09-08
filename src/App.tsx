import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Login from "./pages/Login"
import NotFound from "./pages/NotFound"
import Report from "./pages/Report"
import CrmPage from "./pages/CrmPage"
import DataPage from "./pages/DataPage"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/crm" element={<CrmPage />} />
      <Route path="/data" element={<DataPage />} />
      {/* 老板周报只读视图：公开访问，凭分享令牌 */}
      <Route path="/r/:token" element={<Report />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
