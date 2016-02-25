self.getMethodToTest = () => {
  const methodRegex = /[\?&]method=(\w+)/;
  const methodRegexResult = methodRegex.exec(location.search);
  if (!methodRegexResult) {
    throw new Error('Unable to get the router method.');
  }

  return methodRegexResult[1];
};
