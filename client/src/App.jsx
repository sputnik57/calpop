import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { LettersPage } from './pages/LettersPage'
import { LetterEditor } from './pages/LetterEditor'
import { Inbox } from './pages/Inbox'
import { ResponseStation } from './pages/ResponseStation'
import { IntakeArea } from './pages/ScantronStation'
import { PrisonersPage } from './pages/PrisonersPage'
import { EnvelopeMgtPage } from './pages/EnvelopeMgtPage'
import { SponsorsPage } from './pages/SponsorsPage'
import { ScanLetterUpload } from './pages/ScanLetterUpload'

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
                    <Route path="letters/:id/scan" element={<ScanLetterUpload />} />
                    <Route path="scantron" element={<IntakeArea />} />
                    <Route path="envelope" element={<EnvelopeMgtPage />} />
                    <Route path="prisoners" element={<PrisonersPage />} />
                    <Route path="sponsors" element={<SponsorsPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App
