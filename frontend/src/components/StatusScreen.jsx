import { Logo } from "./Logo.jsx";

/** Full-page loading or error state shown before the app can render (session check, household load). */
export function StatusScreen({ title, message, action }) {
  return (
    <main className="auth-page status-screen">
      <section className="card">
        <Logo />
        {title && <h1>{title}</h1>}
        <p role="status">{message}</p>
        {action}
      </section>
    </main>
  );
}
