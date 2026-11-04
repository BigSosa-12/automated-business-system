// Copy pools for the Template Studio. Every sentence is a plain statement about what the service does or a question.
// Policy (PROSPECT_FOUNDRY_POLICY #10-11): no invented problems, losses, urgency, rankings, guarantees or testimonials.
export const STYLES = ['question', 'observation', 'peer', 'direct', 'soft'];

const DIGI = 'Thanks,\nBattleCreekServices';
const BRIAN_PROP = 'Thanks,\nBrian\nBattle Creek Property Services';
const BRIAN_DETAIL = 'Thanks,\nBrian\nB’s Supa Clean Cars';

export const SERVICES = {
  WEBSITE_WORLD: {
    label: 'Website Design', sign: DIGI,
    subjects: ['[Business Name] online', 'A website idea for [Business Name]', 'Quick idea for [Business Name]', 'Website preview for [Business Name]', 'Question about [Business Name]’s website', 'A custom site for [Business Name]?', 'What could [Business Name] look like online?'],
    openers: {
      question: ['Quick question: when someone searches for [Business Name], what would you want them to see first?', 'Does the website for [Business Name] show the business the way you’d describe it in person?'],
      observation: ['I came across [Business Name] and wanted to reach out about how the business shows up online.', 'I was looking at local businesses online and [Business Name] came up as one worth reaching out to.'],
      peer: ['I build websites for independent and local businesses, and [Business Name] came up while I was looking around.', 'We’re a small web design team that helps owners get a site that fits how their business actually runs.'],
      direct: ['I’ll keep this short: we design and build professional websites around the business, not around a generic template.', 'Short note: BattleCreekServices designs custom websites for local and independent businesses.'],
      soft: ['If a new or refreshed website for [Business Name] has been on the to-do list, here’s an easy way to see what it could look like.', 'If you’ve ever wondered what [Business Name] could look like with a professionally designed site, I can show you.'],
    },
    values: ['Each site is designed around your services, your customers and your style.', 'We can put together a free visual preview first, so you see the direction before deciding anything.', 'That means clear pages, easy ways for customers to contact you, and a layout that works on phones and computers.', 'A preview is just a way to see what’s possible, with no commitment attached.'],
    ctas: ['Would you like me to send over a quick preview?', 'Want me to send a couple of ideas?', 'Would that be worth a look?', 'Open to seeing a free preview?', 'If you’re interested, just reply and I’ll send it over.'],
  },
  LOCAL_DETAILING: {
    label: 'Interior Detailing', sign: BRIAN_DETAIL,
    subjects: ['[Business Name] vehicle interiors', 'Interior detailing for [Business Name]', 'Keeping vehicle interiors clean', 'Interior cleaning for work vehicles', 'A local option for vehicle interiors', 'Quick question about vehicle interiors', 'Interior detailing options for your vehicles'],
    openers: {
      question: ['Who handles interior cleaning for the vehicles at [Business Name]?', 'When a vehicle at [Business Name] needs its interior cleaned up, is that handled in-house or sent out?'],
      observation: ['I came across [Business Name] and thought there could be a simple fit with what we do.', 'Vehicles seem to be a regular part of the work at [Business Name], which is why I’m reaching out.'],
      peer: ['I’m local to Battle Creek, and B’s Supa Clean Cars focuses on interior detailing for businesses with vehicles that stay in use.', 'I run a small local detailing business, and I’m getting to know other businesses in the area.'],
      direct: ['Short note: B’s Supa Clean Cars provides professional interior detailing for local business vehicles.', 'I’ll keep this brief: we detail vehicle interiors for local businesses and fleets.'],
      soft: ['If keeping vehicle interiors clean is a recurring job for [Business Name], we may be able to help without tying up your team.', 'If it would help to have a local detailer you can call, I’d be glad to introduce what we do.'],
    },
    values: ['We handle professional interior detailing for dealerships, service companies, fleets and other vehicle-heavy operations.', 'The goal is getting interiors back clean without pulling your team away from their work.'],
    ctas: ['Would it be worth sending you our business detailing options?', 'Want me to send over what we offer?', 'Would a quick overview be useful?', 'If it’s helpful, reply and I’ll send the details.', 'Should I send a short list of how we work with local businesses?'],
  },
  DIGITAL_INQUIRY: {
    label: 'Inquiry Follow-up', sign: DIGI,
    subjects: ['Inquiry follow-up', 'Older inquiries at [Business Name]', 'Quick question about inquiries', 'Following up on past inquiries', 'A follow-up sprint for [Business Name]', 'What happens to older inquiries?', 'Idea for your older inquiries'],
    openers: {
      question: ['Quick question: what usually happens to inquiries at [Business Name] that don’t turn into a customer the first time?', 'When someone reaches out to [Business Name] and then goes quiet, who follows up?'],
      observation: ['It’s common for older inquiries to sit in an inbox or CRM once the team gets busy with current work.', 'Following up on every older inquiry can easily fall behind when a team is focused on current customers.'],
      peer: ['I help small teams that are too busy with current customers to go back through older inquiries.', 'BattleCreekServices helps businesses revisit past inquiries so their staff doesn’t have to do it by hand.'],
      direct: ['I’ll keep this short: BattleCreekServices handles follow-up on older inquiries so your team doesn’t have to.', 'Short version: we follow up on past inquiries on your behalf.'],
      soft: ['If [Business Name] has inquiries from past months that never turned into a conversation, there may be an easy way to revisit them.', 'If older inquiries are sitting in your inbox or CRM, I may be able to help.'],
    },
    values: ['We run a focused follow-up sprint through your approved customer channels.', 'Your staff stays on current work while we reach back out.', 'We work from the inquiries you already have, so nothing about how you operate has to change.', 'It’s a focused project rather than another recurring task for your team.'],
    ctas: ['Would it be useful if I sent the quick breakdown?', 'Want the short version of how it works?', 'Should I send over a one-page overview?', 'If it’s helpful, just reply and I’ll send the details.', 'Would you like to see how it works?'],
  },
  DIGITAL_ESTIMATES: {
    label: 'Estimate Follow-up', sign: DIGI,
    subjects: ['Estimate follow-up', 'Older estimates at [Business Name]', 'Quick question about estimates', 'Following up on outstanding estimates', 'A follow-up idea for your estimates', 'What happens after an estimate goes out?', 'Estimate follow-up for [Business Name]'],
    openers: {
      question: ['After an estimate goes out from [Business Name], who follows up with the people who don’t answer right away?', 'How much time does your team spend following up on estimates that go quiet?'],
      observation: ['Estimates have a way of going quiet while the team is busy on active work.', 'Follow-up on older estimates is often the first thing to slip when the schedule fills up.'],
      peer: ['BattleCreekServices can help service businesses follow up on older estimates so crews and office staff stay on active jobs.', 'BattleCreekServices helps businesses that would rather spend their time on current work than chasing past estimates.'],
      direct: ['Short version: BattleCreekServices follows up on outstanding estimates for you, through your approved channels.', 'I’ll keep this brief: we handle follow-up on older estimates so your team doesn’t have to.'],
      soft: ['If [Business Name] has estimates from past weeks or months that never got a response, a focused follow-up may be worth a look.', 'If there are estimates sitting without an answer, I may be able to take the follow-up off your plate.'],
    },
    values: ['We handle a focused follow-up on those estimates through your approved channels.', 'Your team keeps working on active jobs while we reach back out.', 'We work from the estimates you already have, so nothing about your process has to change.', 'It’s a focused follow-up effort, not another recurring task for your staff.'],
    ctas: ['Would it be useful if I sent the quick breakdown?', 'Want the short version of how it works?', 'Should I send a one-page overview?', 'If it’s helpful, reply and I’ll send the details.', 'Would you like to see how it works?'],
  },
  GOOGLE_REVIEWS: {
    label: 'Google Review Responses', sign: DIGI,
    subjects: ['Google review responses', 'Idea for your Google reviews', 'Keeping up with reviews', 'Review replies for [Business Name]', 'Quick question about your Google reviews', 'A simple way to handle review replies', 'Replying to reviews at [Business Name]'],
    openers: {
      question: ['Who handles replying to Google reviews at [Business Name]?', 'Is replying to Google reviews one of those jobs that keeps slipping down the list at [Business Name]?'],
      observation: ['Replying to Google reviews is a small job that can take more time than it should.', 'Keeping a steady, professional voice in review replies is easy to plan and hard to keep up with.'],
      peer: ['BattleCreekServices can write review responses so your profile stays active without another task for the owner.', 'BattleCreekServices helps businesses keep up with Google review replies.'],
      direct: ['Short version: BattleCreekServices writes professional, on-brand replies to your Google reviews.', 'I’ll keep this short: we take review replies off your to-do list.'],
      soft: ['If keeping up with review replies is on the to-do list for [Business Name], I may be able to take it off your plate.', 'If your Google reviews could use a consistent voice, I’d be glad to show you what that looks like.'],
    },
    values: ['We write professional, on-brand responses so your profile stays active without adding a recurring task to your team.', 'I can show a couple of sample replies using reviews you already have.', 'Each reply is written thoughtfully, whether the review is glowing or critical.'],
    ctas: ['Want me to send a couple of sample responses?', 'Would a quick example be useful?', 'Should I send over how it works?', 'If it’s helpful, reply and I’ll send a few examples.', 'Would you like to see a sample?'],
  },
  LOCAL_PROPERTY: {
    label: 'Property Services', sign: BRIAN_PROP,
    subjects: ['Quick question about property turnovers', 'Local help for cleanouts and turnovers', 'A backup for turnovers and cleanouts', 'Property cleanout help nearby', 'A local option for turnovers', '[Business Name] — cleanouts and turnovers', 'Furniture removal and moving help'],
    openers: {
      question: ['When a property needs to be cleared out or turned over quickly, do you already have someone local you rely on?', 'Who does [Business Name] call when a unit needs a cleanout or turnover clean?'],
      observation: ['Property turnovers usually mean a mix of cleaning, hauling and moving, and it helps to have people you can call.', 'Cleanouts and turnovers tend to come up on short notice, so a reliable local contact helps.'],
      peer: ['I’m local, and Battle Creek Property Services handles cleanouts, turnover cleaning, furniture removal, moving/delivery and related property jobs.', 'I run a local property services company and I’m getting to know property managers and owners in the area.'],
      direct: ['Short note: Battle Creek Property Services handles cleanouts, turnover cleaning and furniture removal locally.', 'I’ll keep this brief: we take on property cleanouts and turnovers in the local area.'],
      soft: ['If it would help to have a backup company on your list, here’s what we handle.', 'If your usual help is ever booked, it may be useful to have another local option.'],
    },
    values: ['We take on cleanouts, turnover cleaning, furniture removal, moving/delivery and related property jobs in the local area.', 'It can be handy to have a backup option when your regular help isn’t available.', 'I’d be glad to send what we handle and how to reach us.'],
    ctas: ['Would it help if I sent over what we handle?', 'Want me to send a quick overview?', 'If it’s useful, reply and I’ll send the details.', 'Would a short list of our services be helpful?'],
  },
};
