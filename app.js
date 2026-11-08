var yearSpan = document.getElementById("year");
if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}

// Contact page: fill in the product when someone clicks "Request a Quote" on a product
var productInput = document.getElementById("productInput");
if (productInput) {
  var product = new URLSearchParams(window.location.search).get("product");
  if (product) {
    productInput.value = product;
    var quoteForm = document.getElementById("quoteForm");
    if (quoteForm) quoteForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// Contact page: send forms to Formspree without leaving the page
function connectForm(formId, statusId) {
  var form = document.getElementById(formId);
  var status = document.getElementById(statusId);
  if (!form || !status) return;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = "Sending…";
    status.style.color = "";
    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" }
    })
      .then(function (res) {
        if (!res.ok) throw new Error();
        form.reset();
        status.textContent = "Thank you! We have received your message and will get back to you soon.";
        status.style.color = "#2e7d32";
      })
      .catch(function () {
        status.textContent = "Sorry, your message could not be sent. Please call +254 702 468 500 or email info@nyumbhutni.co.ke.";
        status.style.color = "#b71c1c";
      })
      .then(function () { button.disabled = false; });
  });
}
connectForm("quoteForm", "quoteStatus");
connectForm("contactForm", "contactStatus");
