/* Replace with your deployed Cloudflare Worker URL */
const WORKER_URL = "https://routinebuilder.bradleyjosephleon.workers.dev/";

const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");

let products = [];
let selectedProducts = [];
let isRequesting = false;

// Keep the full conversation so follow-up questions have the earlier context.
const messages = [
  {
    role: "system",
    content:
      "You are a helpful L'Oréal beauty and product advisor. Build practical routines using the products the user selected, and answer follow-up questions clearly and concisely.",
  },
];

// Load the product list and use its categories to build the filter.
async function loadProducts() {
  try {
    const response = await fetch("products.json");
    if (!response.ok) {
      throw new Error(`Could not load products: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data.products)) {
      throw new Error("The product list has an unexpected format.");
    }

    products = data.products;
    addCategoryOptions();
    displayProducts(products);
    displaySelectedProducts();
  } catch (error) {
    console.error(error);
    productsContainer.textContent =
      "Products could not be loaded. Please try again later.";
  }
}

// Add a filter option for every category in products.json.
function addCategoryOptions() {
  categoryFilter.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All products";
  categoryFilter.appendChild(allOption);

  const categories = [...new Set(products.map((product) => product.category))];

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    categoryFilter.appendChild(option);
  });
}

// Show product images as buttons so clicking one adds or removes that product.
function displayProducts(productsToShow) {
  productsContainer.replaceChildren();

  productsToShow.forEach((product) => {
    const isSelected = selectedProducts.some(
      (selectedProduct) => selectedProduct.id === product.id,
    );
    const card = document.createElement("article");
    card.className = isSelected ? "product-card selected" : "product-card";

    const imageButton = document.createElement("button");
    imageButton.className = "product-image-button";
    imageButton.type = "button";
    imageButton.setAttribute("aria-pressed", String(isSelected));
    imageButton.setAttribute(
      "aria-label",
      `${isSelected ? "Remove" : "Add"} ${product.name} ${
        isSelected ? "from" : "to"
      } your routine`,
    );
    imageButton.addEventListener("click", () => toggleProduct(product));

    const image = document.createElement("img");
    image.src = product.image;
    image.alt = product.name;
    image.loading = "lazy";
    imageButton.appendChild(image);

    const productInfo = document.createElement("div");
    productInfo.className = "product-info";

    const productVisual = document.createElement("div");
    productVisual.className = "product-visual";

    const productContent = document.createElement("div");
    productContent.className = "product-content";

    const name = document.createElement("h3");
    name.textContent = product.name;

    const brand = document.createElement("p");
    brand.textContent = product.brand;

    const viewToggleButton = document.createElement("button");
    viewToggleButton.className = "product-view-toggle";
    viewToggleButton.type = "button";
    viewToggleButton.textContent = "Show description";

    const description = document.createElement("p");
    description.className = "product-description";
    description.textContent = product.description;
    description.hidden = true;

    viewToggleButton.addEventListener("click", () => {
      const showingDescription = description.hidden;
      description.hidden = !showingDescription;
      imageButton.style.visibility = showingDescription ? "hidden" : "visible";
      viewToggleButton.textContent = showingDescription
        ? "Show image"
        : "Show description";
    });

    productContent.append(imageButton, description);
    productVisual.append(productContent, viewToggleButton);
    productInfo.append(name, brand);
    card.append(productVisual, productInfo);
    productsContainer.appendChild(card);
  });
}

// Add a product once, or remove it if it is already in the routine.
function toggleProduct(product) {
  const alreadySelected = selectedProducts.some(
    (selectedProduct) => selectedProduct.id === product.id,
  );

  if (alreadySelected) {
    selectedProducts = selectedProducts.filter(
      (selectedProduct) => selectedProduct.id !== product.id,
    );
  } else {
    selectedProducts.push(product);
  }

  displayProducts(getFilteredProducts());
  displaySelectedProducts();
}

// Show an image and a remove button for every product in the routine.
function displaySelectedProducts() {
  selectedProductsList.replaceChildren();

  selectedProducts.forEach((product) => {
    const selectedProduct = document.createElement("div");
    selectedProduct.className = "selected-product";

    const image = document.createElement("img");
    image.src = product.image;
    image.alt = product.name;
    image.loading = "lazy";

    const name = document.createElement("p");
    name.textContent = product.name;

    const removeButton = document.createElement("button");
    removeButton.className = "remove-product";
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove ${product.name}`);
    removeButton.addEventListener("click", () => toggleProduct(product));

    selectedProduct.append(image, name, removeButton);
    selectedProductsList.appendChild(selectedProduct);
  });

  generateRoutineButton.disabled =
    selectedProducts.length === 0 || isRequesting;
}

function getFilteredProducts() {
  const selectedCategory = categoryFilter.value;

  if (selectedCategory === "all") {
    return products;
  }

  return products.filter((product) => product.category === selectedCategory);
}

function getSelectedProductsDescription() {
  if (selectedProducts.length === 0) {
    return "No products have been selected yet.";
  }

  return selectedProducts
    .map(
      (product) =>
        `${product.brand} ${product.name} (${product.category}): ${product.description}`,
    )
    .join("\n");
}

// Send the complete conversation to the class Cloudflare Worker.
async function sendMessage(
  message,
  showUserMessage = true,
  isRoutineRequest = false,
) {
  messages.push({ role: "user", content: message });
  if (showUserMessage) {
    addChatMessage("You", message);
  }
  isRequesting = true;
  generateRoutineButton.disabled = true;
  chatForm.querySelector("button").disabled = true;
  addChatMessage("Advisor", "Thinking...", "thinking-message");

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      throw new Error(`Worker error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      throw new Error("The advisor returned an empty response.");
    }

    messages.push({ role: "assistant", content: reply });
    chatWindow.lastElementChild.remove();
    const formattedReply = isRoutineRequest
      ? `\nHere's your personalized routine using your selected L'OREAL products!\n\n${reply.trim()}\n`
      : reply;
    addChatMessage("Advisor", formattedReply);
  } catch (error) {
    console.error(error);
    chatWindow.lastElementChild.remove();
    addChatMessage("Advisor", "Sorry, something went wrong. Please try again.");
  } finally {
    isRequesting = false;
    chatForm.querySelector("button").disabled = false;
    displaySelectedProducts();
  }
}

// Add messages as text so product data and replies display safely.
function addChatMessage(sender, text, className = "") {
  const messageElement = document.createElement("p");
  messageElement.className = className;
  messageElement.textContent = `${sender}: ${text}`;
  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

categoryFilter.addEventListener("change", () => {
  displayProducts(getFilteredProducts());
});

generateRoutineButton.addEventListener("click", () => {
  sendMessage(
    `Create a personalized routine using these selected products. Return only the numbered routine steps in simple plain text, with each step numbered in order (1., 2., 3., etc.) and separated by a blank line (two newline characters). Do not include an introduction, headings, bullet points, or bold text:\n${getSelectedProductsDescription()}`,
    false,
    true,
  );
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = userInput.value.trim();

  if (!question || isRequesting) {
    return;
  }

  userInput.value = "";
  sendMessage(
    `${question}\n\nProducts currently selected for my routine:\n${getSelectedProductsDescription()}`,
  );
});

loadProducts();