import fetch from '../utils/fetch';

const scrape = async (pbCookie) => {
  const _setting = await fetch('https://poe.com/api/settings', { headers: { cookie: `${pbCookie}` } });
  if (_setting.status !== 200) throw new Error('Failed to fetch token');
  const appSettings = await _setting.json(),
    {
      tchannelData: { channel: channelName },
    } = appSettings;
  return {
    pbCookie,
    channelName,
    appSettings,
  };
};

const getUpdatedSettings = async (channelName, pbCookie) => {
  const _setting = await fetch(`https://poe.com/api/settings?channel=${channelName}`, {
    headers: { cookie: `${pbCookie}` },
  });
  if (_setting.status !== 200) throw new Error('Failed to fetch token');
  const appSettings = await _setting.json(),
    {
      tchannelData: { minSeq },
    } = appSettings;

  return {
    minSeq,
  };
};

export { scrape, getUpdatedSettings };
