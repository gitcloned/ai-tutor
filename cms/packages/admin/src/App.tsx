import { Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import ConceptPage from './ConceptPage';
import TopicPage from './TopicPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select an item from the sidebar
          </div>
        } />
        <Route path="concepts/:id" element={<ConceptPage />} />
        <Route path="topics/:id"   element={<TopicPage />} />
      </Route>
    </Routes>
  );
}
