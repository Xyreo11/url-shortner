const inputUrl = process.argv[2];

if (!inputUrl) {
  console.error("Please input a correct URL");
  process.exit(1);
}

inputUrl = inputUrl.toLocaleLowerCase().trim();
