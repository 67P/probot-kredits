const fs = require('fs');
const ethers = require('ethers');
const Kredits = require('kredits-contracts');

const walletPath  = process.env.KREDITS_WALLET_PATH || './wallet.json';
const walletJson  = fs.readFileSync(walletPath);
const providerUrl = process.env.KREDITS_PROVIDER_URL || 'http://localhost:7545';
const networkId = parseInt(process.env.KREDITS_NETWORK_ID || 100);

const ipfsConfig = {
  host: process.env.IPFS_API_HOST || 'localhost',
  port: process.env.IPFS_API_PORT || '5001',
  protocol: process.env.IPFS_API_PROTOCOL || 'http'
};

module.exports = async (robot) => {
  // remove once in kredits.Contributor
  function getContributorByGithubUser(username) {
    return Contributor.all().then(contributors => {
      let contrib = contributors.find(c => {
        return c.github_username === username;
      });
      if (!contrib) {
        throw new Error(`No contributor found for ${username}`);
      } else {
        return contrib;
      }
    });
  }

  let wallet;
  try {
    wallet = await ethers.Wallet.fromEncryptedWallet(walletJson, process.env.KREDITS_WALLET_PASSWORD);
    robot.log.info('[kredits] Wallet address: ' + wallet.address);
  } catch(error) {
    robot.log.warn('[kredits] Could not load wallet:', error);
    process.exit(1);
  }
  const ethProvider = new ethers.providers.JsonRpcProvider(providerUrl, {chainId: networkId});
  ethProvider.signer = wallet;
  wallet.provider = ethProvider;

  let kredits;
  try {
    kredits = await Kredits.setup(ethProvider, wallet, ipfsConfig);
  } catch(error) {
    robot.log.warn('[kredits] Could not set up kredits:', error);
    process.exit(1);
  }
  const Contributor = kredits.Contributor;
  const Operator = kredits.Operator;

  robot.log('Yay, the app was loaded!');

  robot.on('pull_request.closed', async context => {
    if (!context.payload.pull_request.merged) {
      return;
    }

  });

  robot.on('issues.closed', async context => {
    const assignees = context.payload.issue.assignees.map(a => a.login);
    const label = context.payload.issue.labels.map(l => l.name).find(n => n.match(/^kredits/)[0]);
    const amount = {'1': 100, '2': 500, '3': 1000}[label] || 100;

    assignees.forEach((githubUser) => {
      getContributorByGithubUser(githubUser).then((contributor) => {
        let contributionAttr = {
          contributorId: contributor.id,
          amount: amount,
          contributorIpfsHash: contributor.ipfsHash,
          url: context.payload.issue.url,
          description: context.payload.issue.title,
          details: context.payload.issue,
          kind: 'dev'
        };

        return Operator.addProposal(contributionAttr)
          .catch(error => {
            robot.log.error('[kredits] Error:', error);
            context.github.issues.createComment(context.issue({body: 'please configure your kredits profile'}));
          })
          .then((result) => {
            robot.log.info('[kredits] Result', result);
            context.github.issues.createComment(context.issue({body: 'Great! a kredits proposal was created for you!'}));
          });
      });
    });
  });
}
