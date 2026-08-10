export function renderPairFallback(params: { memberName: string; manageUrl: string; count: number }): {
  subject: string; html: string; text: string;
} {
  const pairWord = params.count === 1 ? 'one of your configured pairs' : `${params.count} of your configured pairs`;
  const subject = 'Action needed: pick a new frame for your membership pair';
  const text = `Hi ${params.memberName},\n\nGood news: your GlassyVision membership is active. However, ${pairWord} could not be started (the frame just sold out or could not ship to your address). The pair is back in your account as an open slot — pick any other frame whenever you like:\n${params.manageUrl}\n\nIf you paid for lens upgrades on that pair, our team will reach out about a refund or credit.\n\n— GlassyVision`;
  const html = `<p>Hi ${params.memberName},</p><p>Good news: your GlassyVision membership is active. However, ${pairWord} could not be started (the frame just sold out or could not ship to your address). The pair is back in your account as an open slot — pick any other frame whenever you like.</p><p><a href="${params.manageUrl}">Choose a new frame →</a></p><p>If you paid for lens upgrades on that pair, our team will reach out about a refund or credit.</p><p>— GlassyVision</p>`;
  return { subject, html, text };
}
