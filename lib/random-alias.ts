const adjectives = [
  "Curious",
  "Focused",
  "Bright",
  "Spirited",
  "Nimble",
  "Clever",
  "Bold",
  "Calm",
  "Steady",
  "Lucky"
];

const animals = [
  "Otter",
  "Falcon",
  "Orca",
  "Lynx",
  "Badger",
  "Hawk",
  "Panda",
  "Fox",
  "Koala",
  "Heron"
];

const randomItem = (items: string[]) =>
  items[Math.floor(Math.random() * items.length)];

export const generateAlias = () => `${randomItem(adjectives)} ${randomItem(animals)}`;
