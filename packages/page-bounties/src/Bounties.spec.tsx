// Copyright 2017-2021 @polkadot/app-bounties authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { DeriveBounties, DeriveCollectiveProposal } from '@polkadot/api-derive/types';
import type { BlockNumber, Bounty, BountyIndex, BountyStatus } from '@polkadot/types/interfaces';

import { fireEvent, render } from '@testing-library/react';
import BN from 'bn.js';
import React, { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';

import { ApiPromise, WsProvider } from '@polkadot/api';
import { lightTheme } from '@polkadot/apps/themes';
import { POLKADOT_GENESIS } from '@polkadot/apps-config';
import { Metadata } from '@polkadot/metadata';
import metaStatic from '@polkadot/metadata/static';
import { ApiContext } from '@polkadot/react-api';
import { ApiProps } from '@polkadot/react-api/types';
import i18next from '@polkadot/react-components/i18n';
import { QueueProvider } from '@polkadot/react-components/Status/Context';
import { QueueProps, QueueTxExtrinsicAdd } from '@polkadot/react-components/Status/types';
import { aliceSigner, MemoryStore } from '@polkadot/test-support/keyring';
import { TypeRegistry } from '@polkadot/types/create';
import { keyring } from '@polkadot/ui-keyring';

import Bounties from './Bounties';
import { BountyApi } from './hooks';

function bountyStatus (status: string): BountyStatus {
  return new TypeRegistry().createType('BountyStatus', status);
}

function aBounty ({ value = balanceOf(1), status = bountyStatus('Proposed') }: Partial<Bounty> = {}): Bounty {
  return new TypeRegistry().createType('Bounty', { status, value });
}

function anIndex (index = 0): BountyIndex {
  return new TypeRegistry().createType('BountyIndex', index);
}

function balanceOf (number: number) {
  return new TypeRegistry().createType('Balance', new BN(number));
}

function aGenesisHash () {
  return new TypeRegistry().createType('Hash', POLKADOT_GENESIS);
}

let mockBountyApi: BountyApi = {
  approveBounty: jest.fn(),
  bestNumber: new BN(1) as BlockNumber,
  bounties: [] as DeriveBounties,
  bountyDepositBase: new BN(1),
  bountyValueMinimum: new BN(1),
  closeBounty: jest.fn(),
  dataDepositPerByte: new BN(1),
  maximumReasonLength: 100,
  proposeBounty: jest.fn(),
  proposeCurator: jest.fn()
};

let mockBalance = balanceOf(1);
let apiWithAugmentations: ApiPromise;
const mockMembers = { isMember: true };

const mockTreasury = {
  burn: new BN(1),
  spendPeriod: new BN(0),
  value: balanceOf(1)
};

jest.mock('./hooks', () => {
  return {
    useBalance: () => mockBalance,
    useBounties: () => mockBountyApi
  };
});

jest.mock('@polkadot/react-hooks/useTreasury', () => {
  return {
    useTreasury: () => mockTreasury
  };
});

export function createApiWithAugmentations (): ApiPromise {
  const registry = new TypeRegistry();
  const metadata = new Metadata(registry, metaStatic);

  registry.setMetadata(metadata);

  const api = new ApiPromise({ provider: new WsProvider('ws://', false), registry });

  api.injectMetadata(metadata, true);

  return api;
}

function bountyInStatus (status: string) {
  return new TypeRegistry().createType('Bounty', { status, value: new BN(151) });
}

function aProposal (extrinsic: SubmittableExtrinsic<'promise'>) {
  return {
    hash: new TypeRegistry().createType('Hash'),
    proposal: apiWithAugmentations
      .registry.createType('Proposal', extrinsic),
    votes: apiWithAugmentations.registry.createType('Votes', {
      ayes: ['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'],
      index: 0,
      nays: ['5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty'],
      threshold: 4
    })
  };
}

jest.mock('@polkadot/react-hooks/useMembers', () => {
  return {
    useMembers: () => mockMembers
  };
});

const propose = jest.fn().mockReturnValue('mockProposeExtrinsic');
let queueExtrinsic: QueueTxExtrinsicAdd;

describe('Bounties', () => {
  beforeAll(async () => {
    await i18next.changeLanguage('en');
    keyring.loadAll({ isDevelopment: true, store: new MemoryStore() });
    apiWithAugmentations = createApiWithAugmentations();
  });
  beforeEach(() => {
    queueExtrinsic = jest.fn() as QueueTxExtrinsicAdd;
  });

  const renderBounties = (bountyApi: Partial<BountyApi> = {}, { balance = 1 } = {}) => {
    mockBountyApi = { ...mockBountyApi, ...bountyApi };
    mockBalance = balanceOf(balance);
    const mockApi: ApiProps = { api: {
      derive: {
        accounts: { info: () => Promise.resolve(() => { /**/ }) }
      },
      genesisHash: aGenesisHash(),
      query: {},
      registry: { chainDecimals: 12 },
      tx: {
        council: {
          propose
        }
      }
    },
    systemName: 'substrate' } as unknown as ApiProps;

    const queue = {
      queueExtrinsic
    } as QueueProps;

    return render(
      <Suspense fallback='...'>
        <QueueProvider value={queue}>
          <MemoryRouter>
            <ThemeProvider theme={lightTheme}>
              <ApiContext.Provider value={mockApi}>
                <Bounties/>
              </ApiContext.Provider>
            </ThemeProvider>
          </MemoryRouter>
        </QueueProvider>
      </Suspense>
    );
  };

  function renderOneBounty (bounty: Bounty, proposals: DeriveCollectiveProposal[] = [], description = '', index = anIndex()) {
    return renderBounties({ bounties: [{ bounty, description, index, proposals }] });
  }

  it('creates correct bounty with proposal', () => {
    const bounty = apiWithAugmentations.registry.createType('Bounty', {
      curatorDeposit: new BN(1),
      status: 'Funded',
      value: new BN(10)
    });

    expect(bounty.curatorDeposit.eq(new BN(1))).toBeTruthy();
    expect(bounty.status.isFunded).toBeTruthy();
    expect(bounty.value.eq(new BN(10))).toBeTruthy();
  });

  it('creates correct proposal', () => {
    const proposal = apiWithAugmentations.registry.createType('Proposal', apiWithAugmentations.tx.bounties.proposeCurator(0, '5EYCAe5ijiYfyeZ2JJCGq56LmPyNRAKzpG4QkoQkkQNB5e6Z', 1));

    expect(proposal.args[0].eq(new BN(0))).toBeTruthy();
    expect(proposal.args[1].toString()).toEqual('5EYCAe5ijiYfyeZ2JJCGq56LmPyNRAKzpG4QkoQkkQNB5e6Z');
    expect(proposal.args[2].eq(new BN(1))).toBeTruthy();
    expect(proposal.method).toEqual('proposeCurator');
  });

  it('creates correct votes', () => {
    const votes = apiWithAugmentations.registry.createType('Votes', { ayes: ['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'], index: 0, nays: ['5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty'], threshold: 4 });

    expect(votes.ayes.length).toEqual(1);
    expect(votes.ayes[0].toString()).toEqual('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
    expect(votes.nays.length).toEqual(1);
    expect(votes.nays[0].toString()).toEqual('5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty');
    expect(votes.index.toNumber()).toEqual(0);
    expect(votes.threshold.toNumber()).toEqual(4);
  });

  it('shows empty list when no bounties', async () => {
    const { findByText } = renderBounties();

    expect(await findByText('No open bounties')).toBeTruthy();
  });

  it('renders a bounty', async () => {
    const { findByText, queryAllByText } = renderOneBounty(aBounty(), [], 'kusama comic book');

    expect(await findByText('kusama comic book')).toBeTruthy();
    expect(queryAllByText('No open bounties')).toHaveLength(0);
  });

  it('renders bounties in order from newest to oldest', async () => {
    const bounty1 = bountyInStatus('Proposed');
    const bounty2 = bountyInStatus('Proposed');
    const bounty3 = bountyInStatus('Proposed');

    const { findAllByTestId } = renderBounties({ bounties: [
      { bounty: bounty1, description: 'bounty 2', index: anIndex(2), proposals: [] },
      { bounty: bounty2, description: 'bounty 1', index: anIndex(1), proposals: [] },
      { bounty: bounty3, description: 'bounty 3', index: anIndex(3), proposals: [] }
    ] });

    const descriptions = await findAllByTestId('description');

    expect(descriptions[0].textContent).toEqual('bounty 3');
    expect(descriptions[1].textContent).toEqual('bounty 2');
    expect(descriptions[2].textContent).toEqual('bounty 1');
  });

  describe('create bounty modal', () => {
    it('validates bounty length', async () => {
      const { findByTestId, findByText } = renderBounties({ maximumReasonLength: 5 });

      const addBountyButton = await findByText('Add Bounty');

      fireEvent.click(addBountyButton);

      const titleInput = await findByTestId('bounty title');

      fireEvent.change(titleInput, { target: { value: 'longer than 5' } });

      expect(await findByText('Title too long')).toBeTruthy();
    });

    it('validates balance is enough for bond', async () => {
      const { findByTestId, findByText, queryByText } = renderBounties(
        { bountyDepositBase: new BN(10), dataDepositPerByte: new BN(1) },
        { balance: 10 }
      );

      const addBountyButton = await findByText('Add Bounty');

      fireEvent.click(addBountyButton);
      expect(await findByText('Description of the Bounty (to be stored on-chain)')).toBeTruthy(); // wait for load

      expect(queryByText('Account does not have enough funds.')).toBeFalsy();

      const titleInput = await findByTestId('bounty title');

      fireEvent.change(titleInput, { target: { value: 'add bytes' } });

      expect(await findByText('Account does not have enough funds.')).toBeTruthy();
    });
  });

  describe('propose curator modal', () => {
    it('shows an error if fee is greater than bounty value', async () => {
      const { findByTestId, findByText } = renderBounties({ bounties: [
        { bounty: aBounty({ status: bountyStatus('Funded'), value: balanceOf(5) }),
          description: 'kusama comic book',
          index: anIndex(),
          proposals: [] }
      ] });
      const proposeCuratorButton = await findByText('Propose Curator');

      fireEvent.click(proposeCuratorButton);
      expect(await findByText('This action will create a Council motion to assign a Curator.')).toBeTruthy();

      const feeInput = await findByTestId("curator's fee");

      fireEvent.change(feeInput, { target: { value: '6' } });

      expect(await findByText("Curator's fee can't be higher than bounty value.")).toBeTruthy();
    });

    it('disables Assign Curator button if validation fails', async () => {
      const { findByTestId, findByText } = renderBounties({ bounties: [
        { bounty: aBounty({ status: bountyStatus('Funded'), value: balanceOf(5) }),
          description: 'kusama comic book',
          index: anIndex(),
          proposals: [] }
      ] });
      const proposeCuratorButton = await findByText('Propose Curator');

      fireEvent.click(proposeCuratorButton);
      expect(await findByText('This action will create a Council motion to assign a Curator.')).toBeTruthy();

      const feeInput = await findByTestId("curator's fee");

      fireEvent.change(feeInput, { target: { value: '6' } });

      const assignCuratorButton = await findByText('Assign curator');

      expect(assignCuratorButton.classList.contains('isDisabled')).toBeTruthy();
    });

    it('queues propose extrinsic on submit', async () => {
      const { findByTestId, findByText, getAllByRole } = renderBounties({ bounties: [
        { bounty: aBounty({ status: bountyStatus('Funded'), value: balanceOf(5) }),
          description: 'kusama comic book',
          index: anIndex(),
          proposals: [] }
      ] });
      const proposeCuratorButton = await findByText('Propose Curator');

      fireEvent.click(proposeCuratorButton);
      expect(await findByText('This action will create a Council motion to assign a Curator.')).toBeTruthy();

      const feeInput = await findByTestId("curator's fee");

      fireEvent.change(feeInput, { target: { value: '0' } });

      const comboboxes = getAllByRole('combobox');

      const proposingAccountInput = comboboxes[0].children[0];
      const proposingCuratorInput = comboboxes[1].children[0];
      const alice = aliceSigner().address;

      fireEvent.change(proposingAccountInput, { target: { value: alice } });
      fireEvent.change(proposingCuratorInput, { target: { value: alice } });

      const assignCuratorButton = await findByText('Assign curator');

      fireEvent.click(assignCuratorButton);
      expect(queueExtrinsic).toHaveBeenCalledWith(expect.objectContaining({ accountId: alice, extrinsic: 'mockProposeExtrinsic' }));
    });
  });

  describe('status is extended when voting', () => {
    it('on proposed curator', async () => {
      const bounty = bountyInStatus('Funded');
      const proposals = [aProposal(apiWithAugmentations.tx.bounties.proposeCurator(0, '5EYCAe5ijiYfyeZ2JJCGq56LmPyNRAKzpG4QkoQkkQNB5e6Z', 1))];

      const { findByText } = renderOneBounty(bounty, proposals);

      expect(await findByText('Curator under voting')).toBeTruthy();
    });

    it('on bounty approval in proposed status', async () => {
      const bounty = bountyInStatus('Proposed');
      const proposals = [aProposal(apiWithAugmentations.tx.bounties.approveBounty(0))];

      const { findByText } = renderOneBounty(bounty, proposals);

      expect(await findByText('Approval under voting')).toBeTruthy();
    });

    it('on parallel bounty approval and bounty close in proposed status', async () => {
      const bounty = bountyInStatus('Proposed');
      const proposals = [
        aProposal(apiWithAugmentations.tx.bounties.closeBounty(0)),
        aProposal(apiWithAugmentations.tx.bounties.approveBounty(0))
      ];

      const { findByText } = renderOneBounty(bounty, proposals);

      expect(await findByText('Approval under voting')).toBeTruthy();
    });

    it('on close bounty in active status', async () => {
      const bounty = bountyInStatus('Active');
      const proposals = [aProposal(apiWithAugmentations.tx.bounties.closeBounty(0))];

      const { findByText } = renderOneBounty(bounty, proposals);

      expect(await findByText('Rejection under voting')).toBeTruthy();
    });

    it('on unassign curator in active state', async () => {
      const bounty = bountyInStatus('Active');
      const proposals = [aProposal(apiWithAugmentations.tx.bounties.unassignCurator(0))];

      const { findByText } = renderOneBounty(bounty, proposals);

      expect(await findByText('Unassign curator under voting')).toBeTruthy();
    });

    it('on bounty approval in active state', async () => {
      const bounty = bountyInStatus('Active');
      const proposals = [aProposal(apiWithAugmentations.tx.bounties.approveBounty(0))];

      const { findByTestId } = renderOneBounty(bounty, proposals);

      await expect(findByTestId('extendedStatus')).rejects.toThrow();
    });
  });
});
