import './windowTitleBar.css';

export default function WindowTitleBar({ title = 'Moti' }: { title?: string }) {
  if (!window.motiWindow) return null;
  return <header className="window-titlebar" aria-label="창 제목 표시줄">
    <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" draggable={false} />
    <span>{title}</span>
  </header>;
}
