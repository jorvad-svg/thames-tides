import { useTideData } from './hooks/useTideData';
import { TideCanvas } from './components/TideCanvas';
import { Overlay } from './components/Overlay';
import { LoadingScreen } from './components/LoadingScreen';
import './App.css';

export default function App() {
  const { data, loading, error } = useTideData();

  if (loading || !data) {
    return <LoadingScreen error={error} />;
  }

  return (
    <>
      <TideCanvas data={data} />
      <Overlay data={data} />
    </>
  );
}
