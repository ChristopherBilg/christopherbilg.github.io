import { Keyboard } from "./keyboard.js";

export class TheoCommandPalette extends HTMLElement {
  constructor() {
    super();
    this.hidden = true;
  }

  static get observedAttributes() {
    return [];
  }

  attributeChangedCallback(attributeName, _oldValue, _newValue) {}

  connectedCallback() {
    const style = document.createElement("style");
    style.textContent = `
      :host {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 400px;
        height: 400px;
        background-color: #fff;
        border-radius: 4px;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.2);
      }
    `;

    const div = document.createElement("div");
    div.textContent = "Command Palette!";

    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(div);

    this.setupKeyboard();
  }

  setupKeyboard() {
    const handleLayoutShift = () => {
      // Toggle the ability to scroll the body and set the padding so there isn't any reflow.
      const widthWithScrollBar = document.body.offsetWidth;
      document.body.style.overflow = !this.hidden ? "hidden" : "auto";
      const widthWithoutScrollBar = document.body.offsetWidth;

      const paddingRight = widthWithoutScrollBar - widthWithScrollBar;
      document.body.style.paddingRight = `${Math.max(paddingRight, 0)}px`;

      // Blur all elements that aren't the command palette.
      const elementsToBlur = Array.from(document.querySelectorAll("body > *:not(theo-command-palette):not(script)"));
      elementsToBlur.forEach((element) => {
        element.style.filter = this.hidden ? "" : "blur(4px)";
      });
    };

    Keyboard.attach(document);

    Keyboard.add_binding({
      key: "k",
      ctrlKey: true,
      desc: "Show the command palette",
      callback: () => {
        if (this.hidden) {
          this.hidden = undefined;
        } else {
          this.hidden = true;
        }

        handleLayoutShift();
      },
    });

    Keyboard.add_binding({
      key: "/",
      desc: "Show the command palette",
      callback: () => {
        if (this.hidden) {
          this.hidden = undefined;
        } else {
          this.hidden = true;
        }

        handleLayoutShift();
      },
    });

    Keyboard.add_binding({
      key: "Escape",
      desc: "Close the command palette",
      callback: () => {
        this.hidden = true;

        handleLayoutShift();
      },
    });

    Keyboard.add_binding({
      key: "1",
      ctrlKey: true,
      desc: "Go to Portfolio",
      callback: () => {
        window.location.href = "/portfolio";
      },
    });
  }
}

customElements.define("theo-command-palette", TheoCommandPalette);
