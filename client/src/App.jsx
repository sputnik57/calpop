import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { LettersPage } from './pages/LettersPage'
import { LetterEditor } from './pages/LetterEditor'
import { Inbox } from './pages/Inbox'
import { ResponseStation } from './pages/ResponseStation'
import { IntakeArea } from './pages/ScantronStation'
import { PrisonersPage } from './pages/PrisonersPage'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="inbox" element={<Inbox />} />
                    <Route path="inbox/respond/:assignmentId" element={<ResponseStation />} />
                    <Route path="letters" element={<LettersPage />} />
                    <Route path="letters/new" element={<LetterEditor />} />
                    <Route path="letters/:id" element={<LetterEditor />} />
                    <Route path="scantron" element={<IntakeArea />} />
                    <Route path="prisoners" element={<PrisonersPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App
