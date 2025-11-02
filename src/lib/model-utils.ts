export const getProviderLogo = (provider: string) => {
  const providerLogos: Record<string, string> = {
    openai: "/logos/openai.svg",
  };

  return providerLogos[provider.toLowerCase()] || null;
};

export const formatModelName = (model: string) => {
  const parts = model.split("/");
  if (parts.length === 2) {
    const [provider, modelName] = parts;
    return {
      name: modelName
        .replace(/-/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase()),
      provider: provider.charAt(0).toUpperCase() + provider.slice(1),
      providerKey: provider,
      logo: getProviderLogo(provider),
    };
  }
  return {
    name: model,
    provider: "",
    providerKey: "",
    logo: null,
  };
};
