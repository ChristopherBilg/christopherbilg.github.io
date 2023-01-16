onmessage = (message) => {
  const newValue = message.data.value + 1_000_000;
  postMessage({ value: newValue });
};
