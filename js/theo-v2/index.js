import { Keyboard } from "./keyboard.js";

export class TheoCommandPalette extends HTMLElement {
  constructor() {
    super();
    this.visible = false;
    this.div = null;
  }

  static get observedAttributes() {
    return ["visible"];
  }

  attributeChangedCallback(attributeName, _oldValue, newValue) {
    if (attributeName === "visible") {
      this.visible = newValue;
    }
  }

  connectedCallback() {
    const style = document.createElement("style");
    style.textContent = `
      :host {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
      }
    `;

    this.div = document.createElement("div");
    this.div.setAttribute("visible", this.visible);
    this.div.style.display = "none";
    this.div.textContent = "Hello, World!";

    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(this.div);

    this.setupKeyboard();
  }

  setupKeyboard() {
    Keyboard.attach(this);

    Keyboard.add_binding({
      key: "k",
      ctrlKey: true,
      desc: "Show the command palette",
      callback: () => {
        this.visible = !this.visible;
        this.div.style.display = this.visible ? "block" : "none";
      },
    });

    Keyboard.add_binding({
      key: "/",
      desc: "Show the command palette",
      callback: () => {
        this.visible = !this.visible;
        this.div.style.display = this.visible ? "block" : "none";
      },
    });

    Keyboard.add_binding({
      key: "Escape",
      desc: "Close the command palette",
      callback: () => {
        this.visible = false;
        this.div.style.display = "none";
      },
    });
  }
}

customElements.define("theo-command-palette", TheoCommandPalette);
