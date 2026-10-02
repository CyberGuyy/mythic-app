// What a widget in the registry without a component shows. Real structure, no sample data.
import PanelTitle from '../PanelTitle.jsx';

export default function Stub({ meta, flair }) {
  return <section className="panel dash-stub">
    <PanelTitle icon={meta.icon} title={meta.name} jp={meta.jp} flair={flair} />
    <p className="empty">This widget is not available.</p>
  </section>;
}
