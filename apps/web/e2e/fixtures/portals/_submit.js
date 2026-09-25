// Shared by the mock portals: counts real submissions (the candidate's own click) and shows a confirmation.
window.__submits = 0;
document.addEventListener("submit", (e) => {
  const form = e.target;
  if (form.dataset.kind === "login") return;
  e.preventDefault();
  window.__submits++;
  const conf = form.dataset.confirmation || "GH-12345";
  setTimeout(() => {
    document.body.innerHTML = `<main><h1>Thank you for applying!</h1><p>Your application has been received. Confirmation number: ${conf}</p></main>`;
    history.pushState({}, "", location.pathname.replace(/\/?$/, "/confirmation"));
  }, 300);
});
