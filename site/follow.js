(() => {
  "use strict";
  const form = document.getElementById("followForm");
  if (!form) return;
  const input = document.getElementById("followEmail");
  const button = document.getElementById("followButton");
  const status = document.getElementById("followStatus");
  const show = (text, ok) => {
    status.textContent = text;
    status.className = "follow-status " + (ok ? "ok" : "err");
  };

  if (/[?&]subscribed=1\b/.test(location.search)) show("You're on the list. Thanks for following along.", true);
  else if (/[?&]subscribe_error=/.test(location.search)) show("Signup didn't go through. Please check the address and try again.", false);

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = input.value.trim();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      show("Please enter a valid email address.", false);
      input.focus();
      return;
    }
    button.disabled = true;
    show("Sending...", true);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email, website: form.elements.website.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        show("You're on the list. Thanks for following along.", true);
        form.reset();
      } else if (res.status === 429) {
        show("Too many tries from this connection. Please try again in an hour.", false);
      } else if (data.error === "invalid_email") {
        show("Please enter a valid email address.", false);
      } else {
        show("Signup didn't go through. Please try again in a few minutes.", false);
      }
    } catch (e) {
      show("Couldn't reach the server. Check your connection and try again.", false);
    } finally {
      button.disabled = false;
    }
  });
})();
