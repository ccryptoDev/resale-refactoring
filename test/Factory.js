const { expect } = require("chai");
const { upgrades } = require("hardhat");

describe("Token Factory", function () {
	let owner, addr1, addr2, addr3, addr4, addr5, addrs;
	let ERC777Factory, erc777instance, erc777ExtraInstance;
	let FactoryFactory, factoryInstance;
	let RAIR721Factory, rair721Instance;
	let MinterFactory, minterInstance;
	
	let ResaleFactory, resaleInstance;
	const initialSupply = 20;
	const tokenPrice = 5;
	const testTokenName = "RAIR Test Token!";
	const collection1Limit = 2;
	const collection2Limit = 10;
	const collection3Limit = 250;
	const collection4Limit = 50;

	const resaleOfferPrice = 123000;

	const OfferStatus = {
		OPEN: 0,
		CLOSED: 1,
		CANCELLED: 2
	};
	
	const rairFeePercentage = 9000; // 9.000%
	const nodeFeePercentage = 1000; // 1.000%

	const firstDeploymentAddress = '0xfa7a32340ea54A3FF70942B33090a8a9A1B50214';
	const secondDeploymentAddress = '0xED2AB923364a57cDB6d8f23A3180DfD2CF7E209B';
	// Contract addresses are derived from the user's address and the nonce of the transaction,
	//		the generated address will always be the same (on this test file)
	hre.tracer.nameTags[firstDeploymentAddress] = "First Deployment Address";
	hre.tracer.nameTags[secondDeploymentAddress] = "Second Deployment Address";

	before(async function() {
		[owner, addr1, addr2, addr3, addr4, addr5, ...addrs] = await ethers.getSigners();	
		ERC777Factory = await ethers.getContractFactory("RAIR777");
		FactoryFactory = await ethers.getContractFactory("RAIR_Token_Factory");
		RAIR721Factory = await ethers.getContractFactory("RAIR_ERC721");
		MinterFactory = await ethers.getContractFactory("Minter_Marketplace");
		ResaleFactory = await ethers.getContractFactory('Resale_MarketPlace');
	});

	describe('Deployments', () => {
		it ("Should deploy the ERC777 contract", async () => {
			erc777instance = await ERC777Factory.deploy(initialSupply, initialSupply * 5, owner.address, [addr1.address]);
			erc777ExtraInstance = await ERC777Factory.deploy(initialSupply * 2, initialSupply * 5, owner.address, [addr2.address]);

			expect(await erc777instance.name()).to.equal("RAIR");
			expect(await erc777instance.symbol()).to.equal("RAIR");
			expect(await erc777instance.decimals()).to.equal(18);
			expect(await erc777instance.granularity()).to.equal(1);
			expect(await erc777instance.totalSupply()).to.equal(initialSupply);
			hre.tracer.nameTags[erc777instance.address] = "First 777 Address";
			hre.tracer.nameTags[erc777ExtraInstance.address] = "Second 777 Address";
		});

		it ("Should deploy the RAIR Factory", async () => {
			factoryInstance = await FactoryFactory.deploy(
				tokenPrice, 			// Price for deployemnt
				erc777instance.address 	// ERC777 Address
			);
			hre.tracer.nameTags[factoryInstance.address] = "Factory";
		});

		it ("Should deploy the Minter Marketplace", async () => {
			minterInstance = await MinterFactory.deploy(
				erc777instance.address, 	// Treasury Address
				rairFeePercentage, 			// Treasury Royalty Percentage
				nodeFeePercentage			// Node Royalty Percentage
			);
			hre.tracer.nameTags[minterInstance.address] = "Minter Marketplace";
		});

		it('Should deploy the Resale MarketPlace', async () => {
			resaleInstance = await ResaleFactory.deploy(
				erc777instance.address // Treasury Address
			);
			hre.tracer.nameTags[resaleInstance.address] = 'Resale Marketplace';
		});
	})

	// Waiting until the diamond standard is finalized to start using upgradeable contracts
	/*describe('Upgradeable Deployments', () => {
		it ("Factory", async () => {
			*	Normal deployment:
			*	variable = await ContractFactory.deploy(...params);
			*	factoryInstance = await FactoryFactory.deploy(tokenPrice, erc777instance.address);
			*
			*	Upgradeable deployment
			*	variable = await upgrades.deployProxy(ContractFactory, [...params])
			factoryInstance = await upgrades.deployProxy(FactoryFactory, [tokenPrice, erc777instance.address]);
		});

		it ("Minter Marketplace", async () => {
			minterInstance = await upgrades.deployProxy(MinterFactory, [erc777instance.address, 9000, 1000]);
		})
	})*/

	describe('Factory', () => {
		/*describe('Upgrades', () => {
			it ("Should upgrade", async () => {
				let FactoryV2 = await ethers.getContractFactory("RAIR_Token_Factory_V2");
				factoryInstance = await upgrades.upgradeProxy(factoryInstance.address, FactoryV2);
			});
		});*/

		describe('Users', () => {
			it ("Roles should be set up", async () => {
				await expect(await factoryInstance.hasRole(await factoryInstance.OWNER(), owner.address)).to.equal(true);
				console.log("owner address--: ", owner.address);
				await expect(await factoryInstance.hasRole(await factoryInstance.ERC777(), erc777instance.address)).to.equal(true);
				await expect(await factoryInstance.getRoleAdmin(await factoryInstance.ERC777())).to.equal(await factoryInstance.OWNER());
				await expect(await factoryInstance.getRoleAdmin(await factoryInstance.OWNER())).to.equal(await factoryInstance.OWNER());
			});

			it ("Only approved ERC777s can send tokens", async () => {
				await expect(erc777ExtraInstance.send(factoryInstance.address, tokenPrice, ethers.utils.toUtf8Bytes('')))
					.to.be.revertedWith(`AccessControl: account ${erc777ExtraInstance.address.toLowerCase()} is missing role ${await factoryInstance.ERC777()}`);
				await expect(factoryInstance.tokensReceived(owner.address, owner.address, factoryInstance.address, tokenPrice, ethers.utils.toUtf8Bytes(''),  ethers.utils.toUtf8Bytes('')))
					.to.be.revertedWith(`AccessControl: account ${owner.address.toLowerCase()} is missing role ${await factoryInstance.ERC777()}`);
			});
			it ("Reverts if there aren't enough tokens for at least 1 contract", async () => {
				await expect(erc777instance.send(factoryInstance.address, tokenPrice - 1, ethers.utils.toUtf8Bytes('')))
					.to.be.revertedWith('RAIR Factory: not enough RAIR tokens to deploy a contract');
			});

			it ("Deploys an ERC721 contract after an ERC777 transfer", async () => {
				// Should return leftover tokens
				await expect(await erc777instance.send(factoryInstance.address, tokenPrice + 1, ethers.utils.toUtf8Bytes(testTokenName)))
					.to.emit(erc777instance, "Sent")
					.to.emit(factoryInstance, 'NewContractDeployed')
					.withArgs(owner.address, 1, firstDeploymentAddress, testTokenName);
				await expect(await erc777instance.balanceOf(owner.address)).to.equal(initialSupply - tokenPrice);
				await expect(await erc777instance.balanceOf(factoryInstance.address)).to.equal(tokenPrice);
			});

			it ("Should track number of token holders", async () => {
				await expect(await factoryInstance.getCreatorsCount()).to.equal(1);
			});

			it ("Should store the addresses of the token holders", async () => {
				await expect(await factoryInstance.creators(0)).to.equal(owner.address)
			});

			it ("Return the ERC777 price of an NFT", async () => {
				await expect(await factoryInstance.deploymentCostForERC777(erc777instance.address)).to.equal(tokenPrice);
			});

			it ("Return the creator's tokens", async () => {
				await expect(await factoryInstance.getContractCountOf(owner.address)).to.equal(1);
			});

			it ("Return the token's creator", async () => {
				await expect(await factoryInstance.contractToOwner(await factoryInstance.ownerToContracts(owner.address, 0))).to.equal(owner.address);
			});
		});

		describe('Withdrawals', () => {
			it ("Cannot withdraw from tokens without the role", async () => {
				await expect(factoryInstance.withdrawTokens(erc777ExtraInstance.address, tokenPrice)).to.revertedWith("RAIR Factory: Specified contract isn't an approved erc777 contract");
			});

			it ("Cannot withdraw more than the balance", async () => {
				await expect(factoryInstance.withdrawTokens(erc777instance.address, tokenPrice + 1)).to.revertedWith("ERC777: transfer amount exceeds balance");
			});

			it ("Owners should withdraw tokens", async () => {
				await expect(await factoryInstance.withdrawTokens(erc777instance.address, tokenPrice)).to.emit(factoryInstance, 'TokensWithdrawn').withArgs(owner.address, erc777instance.address, tokenPrice);
			});
		});

		describe('Owner', () => {
			it ("Only the owner can add ERC777 tokens", async () => {
				let factoryAsAddress1 = factoryInstance.connect(addr1);
				await expect(factoryAsAddress1.grantRole(await factoryInstance.ERC777(), erc777ExtraInstance.address))
					.to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${await factoryInstance.OWNER()}`);
			});

			it ("Add a new ERC777 token", async () => {
				await expect(await factoryInstance.add777Token(erc777ExtraInstance.address, tokenPrice * 2)).to.emit(factoryInstance, 'RoleGranted').to.emit(factoryInstance, 'NewTokensAccepted');
			});

			it ("Mint a token after another ERC777 transfer", async () => {
				await expect(await erc777ExtraInstance.send(factoryInstance.address, tokenPrice * 2, ethers.utils.toUtf8Bytes('')))
					.to.emit(erc777ExtraInstance, "Sent")
					.to.emit(factoryInstance, 'NewContractDeployed')
					.withArgs(owner.address, 2, secondDeploymentAddress, '');
				await expect(await erc777ExtraInstance.balanceOf(owner.address)).to.equal((initialSupply - tokenPrice) * 2);
				await expect(await erc777ExtraInstance.balanceOf(factoryInstance.address)).to.equal(tokenPrice * 2);
				await expect(await factoryInstance.getContractCountOf(owner.address)).to.equal(2);
				await expect(await factoryInstance.contractToOwner(await factoryInstance.ownerToContracts(owner.address, 0))).to.equal(owner.address);
			});

			it ("Only the owner can remove an ERC777 token", async () => {
				let factoryAsAddress1 = factoryInstance.connect(addr1);
				await expect(factoryAsAddress1.revokeRole(await factoryInstance.ERC777(), erc777ExtraInstance.address))
					.to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${await factoryInstance.OWNER()}`);
			});

			it ("Remove an ERC777 token", async () => {
				await expect(await factoryInstance.remove777Token(erc777ExtraInstance.address)).to.emit(factoryInstance, 'RoleRevoked').to.emit(factoryInstance, 'TokenNoLongerAccepted');
			});

			it ("Only the owner can renounce to his role", async () => {
				let factoryAsAddress1 = factoryInstance.connect(addr1);
				await expect(factoryAsAddress1.renounceRole(await factoryInstance.OWNER(), owner.address))
					.to.be.revertedWith(`AccessControl: can only renounce roles for self`);
			});
		});
	})

	describe('RAIR 721', () => {
		describe('Metadata', () => {
			it ("Roles should be set up", async () => {
				rair721Instance = await RAIR721Factory.attach(await factoryInstance.ownerToContracts(owner.address, 0))
				await expect(await rair721Instance.hasRole(await rair721Instance.CREATOR(), owner.address)).to.equal(true);
				await expect(await rair721Instance.getRoleAdmin(await rair721Instance.MINTER())).to.equal(await rair721Instance.CREATOR());
			});

			it ("Should return factory address", async () => {
				await expect(await rair721Instance.factory()).to.equal(factoryInstance.address);
			});

			it ("Correct creator address", async () => {
				await expect(await rair721Instance.getRoleMember(await rair721Instance.CREATOR(), 0)).to.equal(owner.address);
			});

			it ("Correct token name", async () => {
				await expect(await rair721Instance.name()).to.equal(testTokenName);
			});

			it ("Correct token symbol", async () => {
				await expect(await rair721Instance.symbol()).to.equal("RAIR");
			});

			it ("Only the owner can renounce to his role", async () => {
				let rair721AsAddress1 = rair721Instance.connect(addr1);
				await expect(rair721AsAddress1.renounceRole(await rair721Instance.CREATOR(), owner.address))
					.to.be.revertedWith(`AccessControl: can only renounce roles for self`);
			});

			it ("Should know who's the admin role of all roles", async () => {
				await expect(await rair721Instance.getRoleAdmin(await rair721Instance.MINTER())).to.equal(await rair721Instance.CREATOR());
				await expect(await rair721Instance.getRoleAdmin(await rair721Instance.TRADER())).to.equal(await rair721Instance.CREATOR());
				await expect(await rair721Instance.getRoleAdmin(await rair721Instance.CREATOR())).to.equal(await rair721Instance.DEFAULT_ADMIN_ROLE());
			});
		});

		describe('Supply', () => {
			it ("Should display correct initial supply", async () => {
				await expect(rair721Instance.ownerOf(1)).to.be.revertedWith('ERC721: owner query for nonexistent token');
			});

			it ("Should not show next index for nonexistent collections", async () => {
				await expect(rair721Instance.getNextSequentialIndex(0, 0, 0)).to.revertedWith("RAIR ERC721: Product does not exist");
			})

			it ("Should create a Product", async () => {
				await expect(await rair721Instance.getProductCount()).to.equal(0);
				await expect(await rair721Instance.createProduct("COLLECTION #1", collection1Limit)).to.emit(rair721Instance, 'ProductCreated').withArgs(0, 'COLLECTION #1', 0, collection1Limit);
				await expect(await rair721Instance.createProduct("COLLECTION #2", collection2Limit)).to.emit(rair721Instance, 'ProductCreated').withArgs(1, 'COLLECTION #2', collection1Limit, collection2Limit);
				await expect(await rair721Instance.createProduct("COLLECTION #3", collection3Limit)).to.emit(rair721Instance, 'ProductCreated').withArgs(2, 'COLLECTION #3', collection2Limit + collection1Limit, collection3Limit);
				await expect(await rair721Instance.createProduct("COLLECTION #4", collection4Limit)).to.emit(rair721Instance, 'ProductCreated').withArgs(3, 'COLLECTION #4', collection3Limit + collection2Limit + collection1Limit, collection4Limit);
				await expect(await rair721Instance.getProductCount()).to.equal(4);
				await expect((await rair721Instance.getProduct(0)).productName).to.equal("COLLECTION #1");
				await expect((await rair721Instance.getProduct(1)).productName).to.equal("COLLECTION #2");
				await expect((await rair721Instance.getProduct(2)).productName).to.equal("COLLECTION #3");
				await expect((await rair721Instance.getProduct(3)).productName).to.equal("COLLECTION #4");
			});

			it ("Should show the next index for collections", async () => {
				await expect(await rair721Instance.getNextSequentialIndex(0, 0, collection1Limit)).to.equal(0);
				await expect(await rair721Instance.getNextSequentialIndex(0, 1, collection1Limit)).to.equal(1);
				await expect(await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit)).to.equal(0);
				await expect(await rair721Instance.getNextSequentialIndex(1, 1, collection2Limit)).to.equal(1);
				await expect(await rair721Instance.getNextSequentialIndex(2, 0, collection3Limit)).to.equal(0);
				await expect(await rair721Instance.getNextSequentialIndex(2, 23, collection3Limit)).to.equal(23);
				await expect(await rair721Instance.getNextSequentialIndex(3, 0, collection4Limit)).to.equal(0);
			})

			it ("Shouldn't let unauthorized addresses mint", async () => {
				let rair721AsAddress2 = rair721Instance.connect(addr2);
				let next = await rair721Instance.getNextSequentialIndex(0, 0, collection1Limit);
				await expect(next).to.equal(0);
				await expect(rair721AsAddress2.mint(addr3.address, 0, next))
					.to.be.revertedWith(`AccessControl: account ${addr2.address.toLowerCase()} is missing role ${await rair721Instance.MINTER()}`);
				await expect(await rair721Instance.getNextSequentialIndex(0, 0, collection1Limit)).to.equal(next);
			});

			it ("Authorize a Minter", async () => {
				await expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), addr2.address)).to.equal(false);
				await expect(await rair721Instance.grantRole(await rair721Instance.MINTER(), addr2.address)).to.emit(rair721Instance, 'RoleGranted');
				await expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), addr2.address)).to.equal(true);
				await expect(await rair721Instance.getRoleMemberCount(await rair721Instance.MINTER())).to.equal(2);
			});


			it ("Shouldn't lock ranges with tokens outside the collection's range", async () => {
				await expect(rair721Instance.createRangeLock(0, 0, 2, 2)).to.be.revertedWith('RAIR ERC721: Invalid ending token');
				// Invalid starting token
				await expect(rair721Instance.createRangeLock(0, -1, 1, 2)).to.be.reverted; // Negative number is not allowed but there's no specific revert message for this
				await expect(rair721Instance.createRangeLock(1, 0, 9, 11)).to.be.revertedWith('RAIR ERC721: Invalid number of tokens to lock');
			});

			it ("Should say if a lock can be created", async () => {
				await expect(await rair721Instance.canCreateLock(0, 0, 2)).to.equal(false); // 2 is not part of product 0!
				await expect(await rair721Instance.canCreateLock(0, 0, 1)).to.equal(true);
				await expect(await rair721Instance.canCreateLock(1, 0, 4)).to.equal(true);
				await expect(await rair721Instance.canCreateLock(1, 5, 9)).to.equal(true);
				await expect(await rair721Instance.canCreateLock(2, 0, 169)).to.equal(true);
			})

			it ("Should lock ranges inside collections", async () => {
				// RangeLocked Emits: productIndex, startingToken, endingToken, tokensLocked, productName, lockIndex
				await expect(await rair721Instance.createRangeLock(0, 0, 1, 2)).to.emit(rair721Instance, 'RangeLocked').withArgs(0, 0, 1, 2, 'COLLECTION #1', 0);
				await expect(await rair721Instance.createRangeLock(1, 0, 4, 3)).to.emit(rair721Instance, 'RangeLocked').withArgs(1, 2, 6, 3, 'COLLECTION #2', 1);
				await expect(await rair721Instance.createRangeLock(1, 5, 9, 5)).to.emit(rair721Instance, 'RangeLocked').withArgs(1, 7, 11, 5, 'COLLECTION #2', 2);
				await expect(await rair721Instance.createRangeLock(2, 0, 169, 10)).to.emit(rair721Instance, 'RangeLocked').withArgs(2, 12, 181, 10, 'COLLECTION #3', 3);
			});

			it ("Should say if more locks can be created", async () => {
				await expect(await rair721Instance.canCreateLock(0, 0, 1)).to.equal(false); // Already exists
				await expect(await rair721Instance.canCreateLock(2, 0, 169)).to.equal(false); // Same
				await expect(await rair721Instance.canCreateLock(1, 1, 3)).to.equal(false); // Subset of a lock
				await expect(await rair721Instance.canCreateLock(1, 2, 6)).to.equal(false); // Same
			});

			it("Shouldn't lock ranges with invalid information", async () => {
				await expect(rair721Instance.createRangeLock(0, 0, 1, 1)).to.be.revertedWith("RAIR ERC721: Cannot create lock") // Already exists
				await expect(rair721Instance.createRangeLock(2, 0, 169, 2)).to.be.revertedWith("RAIR ERC721: Cannot create lock") // Same
				await expect(rair721Instance.createRangeLock(1, 1, 3, 1)).to.be.revertedWith("RAIR ERC721: Cannot create lock") // Subset of a lock
				await expect(rair721Instance.createRangeLock(1, 2, 6, 2)).to.be.revertedWith("RAIR ERC721: Cannot create lock") // Same
			})

			it ("Locks - Should give information about token ranges", async () => {
				for await (let item of [
					{range: 0, expected: [0, 1, 2, 0]},
					{range: 1, expected: [0, 4, 3, 1]},
					{range: 2, expected: [5, 9, 5, 1]},
					{range: 3, expected: [0, 169, 10, 2]},
				]) {
					let aux = await rair721Instance.getLockedRange(item.range);
					for await (let internal of [0,1,2,3]) {
						await expect(aux[internal]).to.equal(item.expected[internal]); 
					}
				}
			})

			it ("Should let minters mint tokens", async () => {
				let rair721AsAddress2 = rair721Instance.connect(addr2);

				let next = await rair721Instance.getNextSequentialIndex(0, 0, collection1Limit);
				await expect(next).to.equal(0);
				await expect(await rair721AsAddress2.mint(addr3.address, 0, next)).to.emit(rair721Instance, 'Transfer').withArgs(ethers.constants.AddressZero, addr3.address, next);
				await expect(await rair721Instance.getNextSequentialIndex(0, 0, collection1Limit)).to.equal(await next.add(1));
				
				next = await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit);
				await expect(next).to.equal(0);
				await expect(await rair721AsAddress2.mint(addr4.address, 1, next)).to.emit(rair721Instance, 'Transfer').withArgs(ethers.constants.AddressZero, addr4.address, next + 2);
				await expect(await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit)).to.equal(await next.add(1));
				
				next = await rair721Instance.getNextSequentialIndex(0, 0, collection1Limit);
				await expect(next).to.equal(1);
				await expect(await rair721AsAddress2.mint(addr3.address, 0, next))
					.to.emit(rair721Instance, 'ProductCompleted')
						.withArgs(0, 'COLLECTION #1')
					.to.emit(rair721Instance, 'RangeUnlocked')
						.withArgs(0, 0, 1);
				await expect(rair721Instance.getNextSequentialIndex(0, 0, collection1Limit)).to.be.revertedWith("RAIR ERC721: There are no available tokens in this range");
				
				next = await rair721Instance.getNextSequentialIndex(2, 0, collection3Limit);
				await expect(next).to.equal(0);
				await expect(await rair721AsAddress2.mint(addr1.address, 2, next)).to.emit(rair721Instance, 'Transfer').withArgs(ethers.constants.AddressZero, addr1.address, 12);
				await expect(await rair721Instance.getNextSequentialIndex(2, 0, collection3Limit)).to.equal(next.add(1));
			});

			it ("Should give information about locked tokens", async () => {
				await expect(await rair721Instance.isTokenLocked(0)).to.equal(false);
				await expect(await rair721Instance.isTokenLocked(1)).to.equal(false);
				await expect(await rair721Instance.isTokenLocked(2)).to.equal(true);
				await expect(await rair721Instance.isTokenLocked(3)).to.equal(false);
				await expect(await rair721Instance.isTokenLocked(4)).to.equal(false);
				await expect(await rair721Instance.isTokenLocked(5)).to.equal(false);
				await expect(await rair721Instance.isTokenLocked(12)).to.equal(true);
			})

			it ("Minter cannot mint once the collection is complete", async () => {
				await expect(rair721Instance.getNextSequentialIndex(0, 0, collection1Limit)).to.be.revertedWith('RAIR ERC721: There are no available tokens in this range');
				let rair721AsAddress2 = rair721Instance.connect(addr2);
				await expect(rair721AsAddress2.mint(addr3.address, 0, 2)).to.be.revertedWith('RAIR ERC721: Invalid token index');
			});

			it ("Unauthorize a Minter", async () => {
				let rair721AsAddress2 = rair721Instance.connect(addr2);
				await expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), addr2.address)).to.equal(true);
				await expect(await rair721Instance.revokeRole(await rair721Instance.MINTER(), addr2.address)).to.emit(rair721Instance, 'RoleRevoked');
				await expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), addr2.address)).to.equal(false);
				let next = await rair721Instance.getNextSequentialIndex(2, 0, collection3Limit);
				await expect(next).to.equal(1);
				await expect(rair721AsAddress2.mint(addr3.address, 2, next))
					.to.be.revertedWith(`AccessControl: account ${addr2.address.toLowerCase()} is missing role ${await rair721Instance.MINTER()}`);
			});
		});

		describe('Token Data', () => {
			it ("Token Index", async () => {
				await expect(await rair721Instance.tokenByIndex(0)).to.equal(0);
				await expect(await rair721Instance.tokenByIndex(1)).to.equal(2);
				await expect(await rair721Instance.tokenByIndex(2)).to.equal(1);
				await expect(await rair721Instance.tokenByIndex(3)).to.equal(12);
			});

			it ("Token Supply", async () => {
				await expect(await rair721Instance.totalSupply()).to.equal(4);
			});

			it ("Product Data", async () => {
				await expect(await rair721Instance.tokenToProduct(0)).to.equal(0);
				await expect(await rair721Instance.tokenToProduct(1)).to.equal(0);
				await expect(await rair721Instance.tokenToProduct(2)).to.equal(1);
				await expect(await rair721Instance.tokenToProduct(12)).to.equal(2);
			})

			it ("Token Owners", async () => {
				await expect(await rair721Instance.ownerOf(0)).to.equal(addr3.address);
				await expect(await rair721Instance.ownerOf(1)).to.equal(addr3.address);
				await expect(await rair721Instance.ownerOf(2)).to.equal(addr4.address);
				await expect(await rair721Instance.ownerOf(12)).to.equal(addr1.address);
			});

			if ("Token Owners to Products", async () => {
				await expect(await rair721Instance.hasTokenInProduct(addr3.address, 0)).to.equal(true);
				await expect(await rair721Instance.hasTokenInProduct(addr3.address, 1)).to.equal(false);
				await expect(await rair721Instance.hasTokenInProduct(addr3.address, 2)).to.equal(false);
				
				await expect(await rair721Instance.hasTokenInProduct(addr4.address, 0)).to.equal(false);
				await expect(await rair721Instance.hasTokenInProduct(addr4.address, 1)).to.equal(true);
				await expect(await rair721Instance.hasTokenInProduct(addr4.address, 2)).to.equal(false);
				
				await expect(await rair721Instance.hasTokenInProduct(addr1.address, 0)).to.equal(false);
				await expect(await rair721Instance.hasTokenInProduct(addr1.address, 1)).to.equal(false);
				await expect(await rair721Instance.hasTokenInProduct(addr1.address, 2)).to.equal(true);
			});

			it ("Owner balances", async () => {
				await expect(await rair721Instance.balanceOf(owner.address)).to.equal(0);
				await expect(await rair721Instance.balanceOf(addr1.address)).to.equal(1);
				await expect(await rair721Instance.balanceOf(addr2.address)).to.equal(0);
				await expect(await rair721Instance.balanceOf(addr3.address)).to.equal(2);
				await expect(await rair721Instance.balanceOf(addr4.address)).to.equal(1);
			});

			it ("Token Indexes by Owner", async () => {
				await expect(await rair721Instance.tokenOfOwnerByIndex(addr3.address, 0)).to.equal(0);
				await expect(await rair721Instance.tokenOfOwnerByIndex(addr3.address, 1)).to.equal(1);
				await expect(await rair721Instance.tokenOfOwnerByIndex(addr4.address, 0)).to.equal(2);
				await expect(await rair721Instance.tokenOfOwnerByIndex(addr1.address, 0)).to.equal(12);
			});

			it ("Internal Token Indexes", async () => {
				await expect(await rair721Instance.tokenToProductIndex(0)).to.equal(0);
				await expect(await rair721Instance.tokenToProductIndex(1)).to.equal(1);
				await expect(await rair721Instance.tokenToProductIndex(2)).to.equal(0);
				await expect(await rair721Instance.tokenToProductIndex(12)).to.equal(0);
			});

			it ("Should get product tokens' length", async () => {
				await expect(await rair721Instance.tokenCountByProduct(0)).to.equal(2);
				await expect(await rair721Instance.tokenCountByProduct(1)).to.equal(1);
				await expect(await rair721Instance.tokenCountByProduct(2)).to.equal(1);
			});

			it ("Should get product tokens", async () => {
				await expect(await rair721Instance.tokensByProduct(0, 0)).to.equal(0);
				await expect(await rair721Instance.tokensByProduct(0, 1)).to.equal(1);
				await expect(await rair721Instance.tokensByProduct(1, 0)).to.equal(2);
				await expect(await rair721Instance.tokensByProduct(2, 0)).to.equal(12);
			});

			it ("Should say if an user holds a token in a product", async () => {
				// Product 0: Address 3 owns both tokens
				await expect(await rair721Instance.hasTokenInProduct(addr1.address, 0, 0, 1)).to.equal(false);
				await expect(await rair721Instance.hasTokenInProduct(addr2.address, 0, 0, 1)).to.equal(false);
				await expect(await rair721Instance.hasTokenInProduct(addr3.address, 0, 0, 1)).to.equal(true);
				await expect(await rair721Instance.hasTokenInProduct(addr3.address, 0, 0, 0)).to.equal(true); // Single token search
				await expect(await rair721Instance.hasTokenInProduct(addr4.address, 0, 0, 1)).to.equal(false);

				// Product 1: Address 4 owns the only token minted
				await expect(await rair721Instance.hasTokenInProduct(addr1.address, 1, 0, collection2Limit - 1)).to.equal(false);
				await expect(await rair721Instance.hasTokenInProduct(addr2.address, 1, 0, collection2Limit - 1)).to.equal(false);
				await expect(await rair721Instance.hasTokenInProduct(addr3.address, 1, 0, collection2Limit - 1)).to.equal(false);
				await expect(await rair721Instance.hasTokenInProduct(addr4.address, 1, 0, collection2Limit - 1)).to.equal(true);
				await expect(await rair721Instance.hasTokenInProduct(addr4.address, 1, 1, collection2Limit - 1)).to.equal(false); // Range doesn't include the token Addr4 owns
				
				// Product 2: Address 1 owns the only token minted
				await expect(await rair721Instance.hasTokenInProduct(addr1.address, 2, 0, collection3Limit - 1)).to.equal(true);
				await expect(await rair721Instance.hasTokenInProduct(addr1.address, 2, 1, collection3Limit - 1)).to.equal(false); // Range doesn't include the token Addr4 owns
				await expect(await rair721Instance.hasTokenInProduct(addr2.address, 2, 0, collection3Limit - 1)).to.equal(false);
				await expect(await rair721Instance.hasTokenInProduct(addr3.address, 2, 0, collection3Limit - 1)).to.equal(false);
				await expect(await rair721Instance.hasTokenInProduct(addr4.address, 2, 0, collection3Limit - 1)).to.equal(false);
			});			

			it ("Should get empty token URIs", async () => {
				await expect(await rair721Instance.tokenURI(0)).to.equal("");
				await expect(await rair721Instance.tokenURI(1)).to.equal("");
				await expect(await rair721Instance.tokenURI(2)).to.equal("");
				await expect(await rair721Instance.tokenURI(12)).to.equal("");
			});

			it ("Shouldn't let anyone but the creator update the URI", async () => {
				let rair721AsAddress2 = rair721Instance.connect(addr2);
				let rair721AsAddress1 = rair721Instance.connect(addr1);
				let rair721AsAddress3 = rair721Instance.connect(addr3);
				await expect(rair721AsAddress2.setBaseURI("PPPPPPPPPP"))
					.to.be.revertedWith(`AccessControl: account ${addr2.address.toLowerCase()} is missing role ${await rair721Instance.CREATOR()}`);
				await expect(rair721AsAddress1.setBaseURI("QQQQQQQQQ"))
					.to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${await rair721Instance.CREATOR()}`);
				await expect(rair721AsAddress3.setBaseURI("SSSSSSSSSSSSS"))
					.to.be.revertedWith(`AccessControl: account ${addr3.address.toLowerCase()} is missing role ${await rair721Instance.CREATOR()}`);
			});

			it ("Should set a base URI", async () => {
				await expect(await rair721Instance.setBaseURI('DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD/'));
			});

			it ("Should set a new specific token URI", async () => {
				await expect(await rair721Instance.setUniqueURI(0, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/')).to.emit(rair721Instance, "TokenURIChanged").withArgs(0, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/');
				await expect(await rair721Instance.setUniqueURI(1, 'BBBBBBBBB/')).to.emit(rair721Instance, "TokenURIChanged").withArgs(1, 'BBBBBBBBB/');
			});

			it ("Should set a new specific product URI", async () => {
				await expect(await rair721Instance.setProductURI(0, 'ProductURI/')).to.emit(rair721Instance, "ProductURIChanged").withArgs(0, 'ProductURI/');
				await expect(await rair721Instance.setProductURI(1, 'CCCCCCCCCCCCCCCCCCCCCCCC/')).to.emit(rair721Instance, "ProductURIChanged").withArgs(1, 'CCCCCCCCCCCCCCCCCCCCCCCC/');
			});

			it ("Should get the token URIs", async () => {
				// Unique URI has more priority than Product URI
				await expect(await rair721Instance.tokenURI(0)).to.equal("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/");
				await expect(await rair721Instance.tokenURI(1)).to.equal("BBBBBBBBB/");
				// Token #0 in this product!
				await expect(await rair721Instance.tokenURI(2)).to.equal("CCCCCCCCCCCCCCCCCCCCCCCC/0"); 
				await expect(await rair721Instance.tokenURI(12)).to.equal("DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD/12");
			});

			it ("Should update unique URIs in batches", async () => {
				await expect(await rair721Instance.setUniqueURIBatch(
					[0, 1, 2, 12],
					['R/', 'A/', 'I/','R/']
				))
				.to.emit(rair721Instance, "TokenURIChanged").withArgs(0, 'R/')
				.to.emit(rair721Instance, "TokenURIChanged").withArgs(1, 'A/')
				.to.emit(rair721Instance, "TokenURIChanged").withArgs(2, 'I/')
				.to.emit(rair721Instance, "TokenURIChanged").withArgs(12, 'R/');
				await expect(await rair721Instance.tokenURI(0)).to.equal("R/");
				await expect(await rair721Instance.tokenURI(1)).to.equal("A/");
				await expect(await rair721Instance.tokenURI(2)).to.equal("I/");
				await expect(await rair721Instance.tokenURI(12)).to.equal("R/");
			});

			it ("Should start with an empty contract URI", async () => {
				await expect(await rair721Instance.contractURI()).to.equal("");
			});

			it ("Should update the contract URI", async () => {
				await expect(await rair721Instance.setContractURI("dev.rair.tech/Metadata"))
					.to.emit(rair721Instance, "ContractURIChanged").withArgs("dev.rair.tech/Metadata");
			});

			it ("Should have the updated metadata URI", async () => {
				await expect(await rair721Instance.contractURI()).to.equal("dev.rair.tech/Metadata");
			})

			it ("Should emit the event OpenSea wants to freeze Metadata", async () => {
				await expect(await rair721Instance.freezeMetadata(0))
					.to.emit(rair721Instance, "PermanentURI").withArgs('R/', 0);
			})

			it ("Should delete unique URI and fallback to Product URI", async () => {
				await expect(await rair721Instance.setUniqueURI(1, '')).to.emit(rair721Instance, "TokenURIChanged").withArgs(1, '');
				await expect(await rair721Instance.tokenURI(1)).to.equal("ProductURI/1");
			});

			it ("Should delete product URI and fallback to Contract URI", async () => {
				await expect(await rair721Instance.setProductURI(0, '')).to.emit(rair721Instance, "ProductURIChanged").withArgs(0, '');
				await expect(await rair721Instance.tokenURI(1)).to.equal("DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD/1");
			});
		});

		describe('Token Operations', () => {
			it ("Should revert if the resale isn't enabled (First party transfer)", async () => {
				let rair721AsAddress1 = rair721Instance.connect(addr1);
				await expect(rair721AsAddress1['safeTransferFrom(address,address,uint256)'](addr1.address, owner.address, 12))
					.to.be.revertedWith("RAIR ERC721: Transfers for this range are currently locked");
			});

			it ("Should revert if a transfer is made by someone without the trader role", async () => {
				let rair721AsAddress3 = rair721Instance.connect(addr3);
				await expect(rair721AsAddress3['safeTransferFrom(address,address,uint256)'](addr3.address, owner.address, 0))
					.to.be.revertedWith(`AccessControl: account ${addr3.address.toLowerCase()} is missing role ${await rair721Instance.TRADER()}`);
			});

			it ("Transfers if the resale is enabled and is an approved trader", async () => {
				let rair721AsAddress3 = rair721Instance.connect(addr3);
				await rair721Instance.grantRole(await rair721Instance.TRADER(), addr3.address);
				await expect(await rair721AsAddress3['safeTransferFrom(address,address,uint256)'](addr3.address, owner.address, 0)).to.emit(rair721Instance, "Transfer");
				await rair721Instance.revokeRole(await rair721Instance.TRADER(), addr3.address);
			});

			it ("Single approval", async () => {
				let rair721AsAddress4 = await rair721Instance.connect(addr4);
				await expect(await rair721AsAddress4.approve(addr2.address, 2))
					.to.emit(rair721Instance, 'Approval')
				await expect(await rair721Instance.getApproved(2)).to.equal(addr2.address);
				
				let rair721AsAddress3 = await rair721Instance.connect(addr3);
				await expect(await rair721AsAddress3.approve(addr2.address, 1))
					.to.emit(rair721Instance, 'Approval')
				await expect(await rair721Instance.getApproved(1)).to.equal(addr2.address);
			});

			it ("Full approval", async () => {
				let rair721AsAddress1 = await rair721Instance.connect(addr1);
				await expect(await rair721AsAddress1.setApprovalForAll(addr4.address, true))
					.to.emit(rair721Instance, 'ApprovalForAll');
				await expect(await rair721Instance.isApprovedForAll(addr1.address, addr4.address)).to.equal(true);
			});

			it ("Third party transfer", async () => {
				let rair721AsAddress2 = await rair721Instance.connect(addr2);
				//transferFrom(from, to, tokenId) is discouraged by OpenZeppelin
				await expect(await rair721Instance.ownerOf(1)).to.equal(addr3.address);
				await rair721Instance.grantRole(await rair721Instance.TRADER(), addr2.address);
				await expect(await rair721AsAddress2['safeTransferFrom(address,address,uint256)'](
					addr3.address, owner.address, 1
				)).to.emit(rair721Instance, 'Transfer').withArgs(addr3.address, owner.address, 1);
				await expect(await rair721Instance.ownerOf(1)).to.equal(owner.address);
			});

			it("Implicit Approval from the TRADER role", async () => {
				await expect(await rair721Instance.isApprovedForAll(owner.address, addr2.address)).to.equal(true);
				await expect(await rair721Instance.isApprovedForAll(addr1.address, addr2.address)).to.equal(true);
				await expect(await rair721Instance.isApprovedForAll(addr3.address, addr2.address)).to.equal(true);
				await expect(await rair721Instance.isApprovedForAll(addr4.address, addr2.address)).to.equal(true);
				await expect(await rair721Instance.isApprovedForAll(rair721Instance.address, addr2.address)).to.equal(true);
			})

			it ("Should revert if the resale isn't enabled (Third party transfer)", async () => {
				let rair721AsAddress4 = await rair721Instance.connect(addr4);
				await expect(await rair721Instance.ownerOf(12)).to.equal(addr1.address);
				await expect(rair721AsAddress4['safeTransferFrom(address,address,uint256)'](
					addr1.address, owner.address, 12
				)).to.revertedWith("RAIR ERC721: Transfers for this range are currently locked");
			});

			it ("Should renounce the TRADER role", async () => {
				await expect(await rair721Instance.hasRole(await rair721Instance.TRADER(), addr2.address)).to.equal(true);
				let rair721AsAddress2 = await rair721Instance.connect(addr2);
				await expect(await rair721AsAddress2.renounceRole(await rair721Instance.TRADER(), addr2.address))
					.to.emit(rair721Instance, "RoleRevoked")
					.withArgs(await rair721Instance.TRADER(), addr2.address, addr2.address);
				await expect(await rair721Instance.hasRole(await rair721Instance.TRADER(), addr2.address)).to.equal(false);
			});
		});
		it ("TODO: Test supportsInterface");
	})

	describe('Minter Marketplace', () => {
		describe("Minting Permissions", () => {
			it ("Refuses to add a collection without a Minter role", async () => {
				// Token Address, Product Index, (internal) Starting Token, (internal) Starting Token, Range Price, Range Name, Node Address
				await expect(minterInstance.addOffer(
					rair721Instance.address, 	// Token Address
					1,							// Product Index
					[0,2,6],					// Starting token in Range
					[1,5,9],					// Ending token in Range
					[1000,500,100],				// Price
					['Deluxe','Standard'],		// Range Name
					owner.address				// Node Address
				)).to.be.revertedWith("Minting Marketplace: This Marketplace isn't a Minter!");
			});

			it ("Grants Marketplace Minter Role", async () => {
				// Token Address, Tokens Allowed, Product Index, Token Price, Node Address
				await expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), minterInstance.address)).to.equal(false);
				await expect(await rair721Instance.grantRole(await rair721Instance.MINTER(), minterInstance.address)).to.emit(rair721Instance, 'RoleGranted').withArgs(await rair721Instance.MINTER(), minterInstance.address, owner.address);
				await expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), minterInstance.address)).to.equal(true);
			});
		});

		describe("Adding Products and Minting", () => {
			it ("Shouldn't set up custom payment rates if the offer doesn't exist (Part 1 - The first offer)", async () => {
				await expect(minterInstance.setCustomPayment(0, [addr1.address, addr2.address, addr3.address, addr4.address], [30000, 10000, 25000, 25000]))
					.to.be.revertedWith("Minting Marketplace: There are no offer pools");
			});

			it ("Shouldn't add a number of tokens higher than the mintable limit", async () => {
				// Token Address, Tokens Allowed, Product Index, Token Price, Node Address
				//console.log(await rair721Instance.getProduct(1));
				await expect(minterInstance.addOffer(
					rair721Instance.address, 	// Token Address
					1,							// Product Index
					[0],						// Starting token in Range
					[10],						// Ending token in Range  /// ERROR HERE, 10 tokens means 0 to 9, 10 is an invalid token
					[1000],						// Price
					['Deluxe'],					// Range Name
					owner.address				// Node Address
				)).to.be.revertedWith("Minting Marketplace: Range's ending token has to be less or equal than the product's ending token!");
			});

			it ("Shouldn't add a range with wrong lengths", async () => {
				// Token Address, Tokens Allowed, Product Index, Token Price, Node Address
				//console.log(await rair721Instance.getProduct(1));
				await expect(minterInstance.addOffer(
					rair721Instance.address, 	// Token Address
					1,							// Product Index
					[0, 2],						// Starting token in Range /// ERROR HERE, this one has 2 elements while the rest has only 1
					[10],						// Ending token in Range
					[1000],						// Price
					['Deluxe'],					// Range Name
					owner.address				// Node Address
				)).to.be.revertedWith("Minting Marketplace: Offer's ranges should have the same length!");
			});

			it ("Should revert if info is asked for non-existant offers", async () => {
				await expect(minterInstance.contractToOfferRange(rair721Instance.address, 0))
					.to.be.revertedWith("Minting Marketplace: There are no offers registered");
			});

			it ("Should add an offer", async () => {
				// Token Address, Tokens Allowed, Product Index, Token Price, Node Address
				await expect(await minterInstance.addOffer(
					rair721Instance.address, 			// Token Address
					1,									// Product Index
					[0,3],								// Starting token in Range
					[2,5],								// Ending token in Range
					[999,500],							// Price
					['Deluxe','Special'],				// Range Name
					owner.address						// Node Address
				)).to.emit(minterInstance, 'AddedOffer').withArgs(rair721Instance.address, 1, 2, 0);
				await expect(await minterInstance.openSales()).to.equal(2);
			});

			it ("Shouldn't add an offer for the same product and contract", async () => {
				// Token Address, Tokens Allowed, Product Index, Token Price, Node Address
				await expect(minterInstance.addOffer(
					rair721Instance.address, 			// Token Address
					1,									// Product Index
					[0,3],								// Starting token in Range
					[2,5],								// Ending token in Range
					[999,500],							// Price
					['Deluxe','Special'],				// Range Name
					owner.address						// Node Address
				)).to.be.revertedWith("Minting Marketplace: An offer already exists for this contract and product");
			});

			it ("Should revert if info is asked for a non-existant product offer", async () => {
				await expect(minterInstance.contractToOfferRange(rair721Instance.address, 0))
					.to.be.revertedWith("Minting Marketplace: There are is no offer registered for that product");
			});

			it ("Should give info about the offers", async () => {
				await expect(await minterInstance.contractToOfferRange(rair721Instance.address, 1)).to.equal(0);
			});

			it ("Should add another offer for the same contract + A range with a single token", async () => {
				// Token Address, Tokens Allowed, Product Index, Token Price, Node Address
				await expect(await minterInstance.addOffer(
					rair721Instance.address, 				// Token Address
					2,										// Product Index
					[0,1],									// Starting token in Range
					[0,249],								// Ending token in Range
					[9999999,1000],							// Price
					['Super Turbo Special DX','Deluxes'],	// Range Name
					owner.address							// Node Address
				)).to.emit(minterInstance, 'AddedOffer').withArgs(rair721Instance.address, 2, 2, 1);
				await expect(await minterInstance.openSales()).to.equal(4);
			});

			it ("Should append a range to an existing offer", async () => {
				await expect(await minterInstance.appendOfferRange(
					0,									// Catalog index
					6,									// Starting token in Range
					9,									// Ending token in Range
					100,								// Price
					'Standard'							// Range Name
					//	event AppendedRange(address contractAddress, uint productIndex, uint offerIndex, uint rangeIndex,  uint startToken, uint endToken, uint price, string name);
				)).to.emit(minterInstance, 'AppendedRange').withArgs(rair721Instance.address, 1, 0, 2, 6, 9, 100, 'Standard');
				await expect(await minterInstance.openSales()).to.equal(5);
			});

			it ("Should append a batch of ranges to an existing offer", async () => {
				await expect(await minterInstance.appendOfferRangeBatch(
					1,									// Catalog index
					[11, 101],							// Starting token in Range
					[100, 169],							// Ending token in Range
					[100, 10],							// Price
					['Special','Standard']				// Range Name
					//	event AppendedRange(address contractAddress, uint productIndex, uint offerIndex, uint rangeIndex,  uint startToken, uint endToken, uint price, string name);
				)).to.emit(minterInstance, 'AppendedRange').withArgs(rair721Instance.address, 2, 1, 2, 11, 100, 100, 'Special')
					.to.emit(minterInstance, 'AppendedRange').withArgs(rair721Instance.address, 2, 1, 3, 101, 169, 10, 'Standard');
				
				await expect(await minterInstance.openSales()).to.equal(7);
			});

			it ("Should mint with permissions", async () => {
				let minterAsAddress2 = await minterInstance.connect(addr2);
				let next = await rair721Instance.getNextSequentialIndex(1, 0, 2);
				await expect(next).to.equal(1);
				await expect(await minterAsAddress2.buyToken(0, 0, next, {value: 999})).to.emit(rair721Instance, "Transfer").withArgs(ethers.constants.AddressZero, addr2.address, next.add(2));
				await expect(await rair721Instance.getNextSequentialIndex(1, 0, 2)).to.equal(2);
				await expect(rair721Instance.getNextSequentialIndex(1, 0, 1)).to.be.revertedWith('RAIR ERC721: There are no available tokens in this range');
			});

			it ("Should create a new offer (Used on the custom payment rate)", async () => {
				// Token Address, Tokens Allowed, Product Index, Token Price, Node Address
				await expect(await minterInstance.addOffer(
					rair721Instance.address, 				// Token Address
					3,										// Product Index
					[0,1,2],								// Starting token in Range
					[0,1,49],								// Ending token in Range
					[888,9999,10000],						// Price
					['DX','Spcial','Standard'],				// Range Name
					owner.address							// Node Address
				)).to.emit(minterInstance, 'AddedOffer').withArgs(rair721Instance.address, 3, 3, 2);
				await expect(await minterInstance.openSales()).to.equal(10);
			});

			it ("Shouldn't batch mint with wrong info", async () => {
				let minterAsAddress2 = await minterInstance.connect(addr2);
				
				// Different lengths in tokens and recipients
				await expect(minterAsAddress2.buyTokenBatch(0, 1, [4,5], [addr2.address, addr1.address, addr3.address], {value: 500 * 3}))
					.to.be.revertedWith("Minting Marketplace: Token Indexes and Recipients should have the same length");

				// More tokens than the allowed to Mint
				await expect(minterAsAddress2.buyTokenBatch(0, 1, [3,4,5,6], [addr2.address, addr1.address, addr3.address, addr2.address], {value: 500 * 3}))
					.to.be.revertedWith("Minting Marketplace: Cannot mint that many tokens for this range!");

				// Insufficient Funds
				await expect(minterAsAddress2.buyTokenBatch(0, 1, [3,4,5], [addr2.address, addr1.address, addr3.address], {value: 500}))
					.to.be.revertedWith("Minting Marketplace: Insuficient Funds!");
			});

			it ("Should batch mint", async () => {
				let minterAsAddress2 = await minterInstance.connect(addr2);
				
				await expect(await minterAsAddress2.buyTokenBatch(0, 1, [3,4,5], [addr2.address, addr1.address, addr3.address], {value: 500 * 3}))
					// ERC721 events emitted
					.to.emit(rair721Instance, "Transfer").withArgs(ethers.constants.AddressZero, addr2.address, 3 + collection1Limit)
					.to.emit(rair721Instance, "Transfer").withArgs(ethers.constants.AddressZero, addr1.address, 4 + collection1Limit)
					.to.emit(rair721Instance, "Transfer").withArgs(ethers.constants.AddressZero, addr3.address, 5 + collection1Limit)
					// Minter events emitted
					.to.emit(minterInstance, "TokenMinted").withArgs(addr2.address, rair721Instance.address, 0, 1, 3)
					.to.emit(minterInstance, "TokenMinted").withArgs(addr1.address, rair721Instance.address, 0, 1, 4)
					.to.emit(minterInstance, "TokenMinted").withArgs(addr3.address, rair721Instance.address, 0, 1, 5)
					// Minter events emitted
					.to.changeEtherBalances([owner, addr2, erc777instance], [455 * 3, -500 * 3, 45 * 3]);

				let magicNumber = 100;
				//await expect
				await minterAsAddress2.buyTokenBatch(1, 1,
						Array.apply(null, Array(magicNumber)).map(function (_, i) {return i + 1;}),
						[
							...Array.apply(null, Array(magicNumber)).map(function (_, i) {return addr2.address;}),
							//...Array.apply(null, Array(40)).map(function (_, i) {return addr1.address;}),
							//...Array.apply(null, Array(9)).map(function (_, i) {return addr3.address;}),
						], {value: 1000 * magicNumber})

				//	.to.changeEtherBalances([owner, addr2, erc777instance], [455 * 249, -500 * 249, 45 * 249]);
				//expect(await minterInstance.openSales()).to.equal(6);
			});

			it ("Shouldn't mint without permissions", async () => {
				await expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), minterInstance.address)).to.equal(true);
				await expect(await rair721Instance.revokeRole(await rair721Instance.MINTER(), minterInstance.address)).to.emit(rair721Instance, 'RoleRevoked');
				await expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), minterInstance.address)).to.equal(false);
				let minterAsAddress2 = await minterInstance.connect(addr2);
				let next = await rair721Instance.getNextSequentialIndex(1, 0, 2);
				await expect(next).to.equal(2);
				await expect(minterAsAddress2.buyToken(0, 0, next, {value: 999})).to.revertedWith(`AccessControl: account ${minterInstance.address.toLowerCase()} is missing role ${await rair721Instance.MINTER()}`);
				await expect(await rair721Instance.getNextSequentialIndex(1, 0, 2)).to.equal(next);
			});

			it ("Shouldn't mint past the allowed number of tokens", async () => {
				await expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), minterInstance.address)).to.equal(false);
				await expect(await rair721Instance.grantRole(await rair721Instance.MINTER(), minterInstance.address)).to.emit(rair721Instance, 'RoleGranted');
				await expect(await rair721Instance.hasRole(await rair721Instance.MINTER(), minterInstance.address)).to.equal(true);
				let minterAsAddress2 = await minterInstance.connect(addr2);

				let next = await rair721Instance.getNextSequentialIndex(1, 0, 2);
				await expect(next).to.equal(2);

				await expect(await minterAsAddress2.buyToken(0, 0, next, {value: 999})).to.emit(rair721Instance, "Transfer")
					.to.changeEtherBalances([owner, addr2, erc777instance], [899 + 9, -999, 89]);

				next = await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit);
				await expect(next).to.equal(6);
				await expect(minterAsAddress2.buyToken(0, 1, next, {value: 500})).to.revertedWith('Minting Marketplace: Cannot mint more tokens for this range!');
				await expect(await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit)).to.equal(next);
			});
		});

		describe("Updating Products", () => {
			it ("Shouldn't let the creator update the collection info limits with wrong info", async () => {
				await expect(minterInstance.updateOfferRange(0, 0, 0, 3, 999, 'Revised Deluxe')).to.be.revertedWith('Minting Marketplace: New limits must be within the previous limits!');
			});

			it ("Should let the creator update the collection info limits", async () => {
				await expect(await minterInstance.updateOfferRange(0, 0, 1, 2, 999, 'Revised Deluxe'))
					.to.emit(minterInstance, 'UpdatedOffer').withArgs(rair721Instance.address, 0, 0, 0, 999, 'Revised Deluxe');
			});

			it ("Shouldn't mint out of bounds", async () => {
				// Product #1 has 10 tokens, but it includes 0, so the last mintable token should be #9
				let minterAsAddress2 = await minterInstance.connect(addr2);
				await expect(minterAsAddress2.buyToken(0, 2, 10, {value: 29999})).to.be.revertedWith("Minting Marketplace: Token doesn't belong in that offer range!");
				await expect(minterAsAddress2.buyToken(0, 2, 5, {value: 29999})).to.be.revertedWith("Minting Marketplace: Token doesn't belong in that offer range!");
			});

			it ("Should mint specific tokens", async () => {
				let minterAsAddress2 = await minterInstance.connect(addr2);
				await expect(await minterAsAddress2.buyToken(0, 2, 8, {value: 29999})).to.emit(rair721Instance, "Transfer").to.changeEtherBalances([owner, addr2, erc777instance], [91, -100, 9]);
				await expect(await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit)).to.equal(6);
			});
			
			it ("Shouldn't mint if the collection is completely minted", async () => {
				let minterAsAddress2 = await minterInstance.connect(addr2);
				// Insufficient funds test
				let next = Number(await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit));
				await expect(next).to.equal(6);
				await expect(minterAsAddress2.buyToken(0, 2, next, {value: 99})).to.revertedWith("Minting Marketplace: Insuficient Funds!");
				await expect(await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit)).to.equal(next);
				
				await expect(await minterAsAddress2.buyToken(0, 2, next, {value: 100})).to.emit(rair721Instance, "Transfer").to.changeEtherBalances([owner, addr2, erc777instance, minterInstance], [91, -100, 9, 0]);
				await expect(await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit)).to.equal(Number(next) + 1);

				// 8 is already minted, so after minting next sequential index should be 9
				next = Number(await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit));
				await expect(next).to.equal(7);
				await expect(await minterAsAddress2.buyToken(0, 2, next, {value: 19999})).to.emit(rair721Instance, "Transfer").to.changeEtherBalances([owner, addr2, erc777instance], [91, -100, 9]);
				await expect(await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit)).to.equal(Number(next) + 2);
				
				next = Number(await rair721Instance.getNextSequentialIndex(1, 0, collection2Limit));
				await expect(next).to.equal(9);
				await expect(await minterAsAddress2.buyToken(0, 2, next, {value: 999999999})).to.emit(rair721Instance, "ProductCompleted").to.changeEtherBalances([owner, addr2, erc777instance], [91, -100, 9]);

				await expect(rair721Instance.getNextSequentialIndex(1, 0, collection2Limit)).to.be.revertedWith('RAIR ERC721: There are no available tokens in this range.');
				await expect(minterAsAddress2.buyToken(0, 2, next + 1, {value: 9999})).to.be.revertedWith('Minting Marketplace: Cannot mint more tokens for this range!');
				await expect(minterAsAddress2.buyToken(0, 3, next + 1, {value: 9999})).to.be.revertedWith('Minting Marketplace: Invalid range!');
			});

			it ("Shouldn't set up custom payment rates if the percentages don't add up to 100%", async () => {
				await expect(minterInstance.setCustomPayment(2, [addr1.address, addr2.address, addr3.address, addr4.address], [29000, 10000, 25000, 25000]))
					.to.be.revertedWith("Minting Marketplace: Percentages should add up to 100% (100000, including node fee and treasury fee)");
				await expect(minterInstance.setCustomPayment(2, [addr1.address, addr2.address, addr3.address, addr4.address], [31000, 10000, 25000, 25000]))
					.to.be.revertedWith("Minting Marketplace: Percentages should add up to 100% (100000, including node fee and treasury fee)");
			});

			it ("Shouldn't set up custom payment rates if the offer doesn't exist", async () => {
				await expect(minterInstance.setCustomPayment(4, [addr1.address, addr2.address, addr3.address, addr4.address], [30000, 10000, 25000, 25000]))
					.to.be.revertedWith("Minting Marketplace: Offer Pool doesn't exist");
				await expect(minterInstance.setCustomPayment(5, [addr1.address, addr2.address, addr3.address, addr4.address], [30000, 10000, 25000, 25000]))
					.to.be.revertedWith("Minting Marketplace: Offer Pool doesn't exist");
			});

			it ("Should set up custom payment rates", async () => {
				await expect(await minterInstance.setCustomPayment(2, [addr1.address, addr2.address, addr3.address, addr4.address], [30000, 10000, 25000, 25000]))
					.to.emit(minterInstance, "CustomPaymentSet")
					.withArgs(2, [addr1.address, addr2.address, addr3.address, addr4.address], [30000, 10000, 25000, 25000]);
			});

			it ("Should do a custom payment split (Single)", async () => {
				await expect(await minterInstance.buyToken(2, 0, 0, {value: 888}))
					.to.emit(rair721Instance, "Transfer").withArgs(ethers.constants.AddressZero,owner.address,262)
					.to.changeEtherBalances([addr1, addr2, addr3, addr4], [266, 88, 222, 222]);
			});
		})

		it ("721 instance returns the correct creator fee", async () => {
			await expect((await rair721Instance.royaltyInfo(1, 123000))[0]).to.equal(owner.address);
			await expect((await rair721Instance.royaltyInfo(1, 123000))[1]).to.equal(36900);
		});
	});

	describe("RAIR 777", async () => {
		describe("Access Control", async () => {
			it ("Owner should have Admin role", async () => {
				await expect(await erc777instance.getRoleMember(await erc777instance.DEFAULT_ADMIN_ROLE(), 0))
					.to.equal(owner.address);
			});

			it ("Owner should be able to grant minter roles", async () => {
				await expect(await erc777instance.grantRole(await erc777instance.MINTER(), owner.address))
					.to.emit(erc777instance, "RoleGranted")
					.withArgs(await erc777instance.MINTER(), owner.address, owner.address);
				await expect(await erc777instance.getRoleMember(await erc777instance.MINTER(), 0))
					.to.equal(owner.address);
			});

			it ("Should mint new RAIR tokens as the owner", async () => {
				await expect(await erc777instance.totalSupply())
					.to.equal(initialSupply);
				await expect(await erc777instance.mint(20, addr1.address))
					.to.emit(erc777instance, "Minted")
					.withArgs(owner.address, addr1.address, 20, '0x', '0x');
				await expect(await erc777instance.totalSupply())
					.to.equal(initialSupply + 20);
			})

			it ("Shouldn't mint new RAIR tokens as any other address", async () => {
				let ownerAsOtherAddress = await erc777instance.connect(addr1);
				await expect(ownerAsOtherAddress.mint(200, addr1.address))
					.to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${await erc777instance.MINTER()}`);
			})
		});
	});

	describe('Resale Marketplace', async () => {
		describe('Permissions', async () => {
			it('Should grant the resale marketplace the TRADER role', async () => {
				await expect(
					await rair721Instance.grantRole(
						await rair721Instance.TRADER(),
						resaleInstance.address
					)
				).to.emit(rair721Instance, 'RoleGranted');
			});

			it('Should revoke the resale marketplace the TRADER role', async () => {
				await expect(
					await rair721Instance.revokeRole(
						await rair721Instance.TRADER(),
						resaleInstance.address
					)
				).to.emit(rair721Instance, 'RoleRevoked');
				await expect(
					await rair721Instance.grantRole(
						await rair721Instance.TRADER(),
						resaleInstance.address
					)
				).to.emit(rair721Instance, 'RoleGranted');
			});

			it('Should approve the resale marketplace to transfer a single token', async () => {
				await expect(await rair721Instance['safeTransferFrom(address,address,uint256)'](
					owner.address, addr3.address, 1
				)).to.emit(rair721Instance, 'Transfer').withArgs(owner.address, addr3.address, 1);

				await expect(
					await rair721Instance.connect(addr3).approve(
						await resaleInstance.address,
						1
					)
				).to.emit(rair721Instance, 'Approval');
			});

			it('Should approve the resale marketplace to transfer all token', async () => {
				await expect(
					await rair721Instance.connect(addr3).setApprovalForAll(
						await resaleInstance.address,
						true
					)
				).to.emit(rair721Instance, 'ApprovalForAll');
			});
		});

		describe('Royalty splits', async () => {
			it ("Shouldn't set custom splits if the user didn't make the contract", async () => {
				await expect(
					resaleInstance.connect(addr1).setCustomRoyalties(
						rair721Instance.address,
						[addr1.address],
						[9000],
					)
				)
					.to.be.revertedWith("Resale Marketplace: Only token creator can set custom royalties")
			});

			it ("Shouldn't set custom splits with invalid information", async () => {
				await expect(
					resaleInstance.setCustomRoyalties(
						rair721Instance.address,
						[addr1.address],
						[90000, 20000], 	// Different lengths in arrays
					)
				)
					.to.be.revertedWith("Resale Marketplace: Recipients and Percentages should have the same length");

				await expect(
					resaleInstance.setCustomRoyalties(
						rair721Instance.address,
						[addr1.address, addr2.address],
						[90000, 20000], 	// Percentage goes over 100%
					)
				)
					.to.be.revertedWith("Resale Marketplace: Royalties exceed the 100%");
			});

			it ("Should set custom royalty splits for all token offers of that contract", async () => {
				await expect(
					await resaleInstance.setCustomRoyalties(
						rair721Instance.address,
						[owner.address, addr1.address, addr2.address],
						[30000, 20000, 20000]
					)
				)
					.to.emit(resaleInstance, "CustomRoyaltiesSet")
					.withArgs(rair721Instance.address, 3, 20000);
			})

			it ("Should replace custom royalty splits at any time", async () => {
				await expect(
					await resaleInstance.setCustomRoyalties(
						rair721Instance.address,
						[owner.address, addr1.address, addr2.address],
						[30000, 25000, 25000]
					)
				)
					.to.emit(resaleInstance, "CustomRoyaltiesSet")
					.withArgs(rair721Instance.address, 3, 10000);
			});

			it ("Shouldn't allow smart contract to receive funds", async () => {
				await expect(
					resaleInstance.setCustomRoyalties(
						rair721Instance.address,
						[addr5.address, erc777ExtraInstance.address],
						[30000, 25000]
					)
				)
					.to.be.revertedWith("Resale Marketplace: For security reasons we don't allow smart contracts to receive funds");
			});
		});
 
		describe('Offers', async () => {
			it("Shouldn't create offers from people that don't own the token", async () => {
				await expect(
					resaleInstance.connect(addr1).createResaleOffer(
						0, 							// Token id
						resaleOfferPrice, 			// Offer price
						rair721Instance.address, 	// Contract Address
						addr5.address 				// Node address
					)
				).to.be.revertedWith('Resale Marketplace: Address does not own the token');
			});

			it("Shouldn't create offers from invalid contracts", async () => {
				await expect(
					resaleInstance.connect(addr1).createResaleOffer(
						0, 							// Token id
						resaleOfferPrice, 			// Offer price
						erc777instance.address, 	// Contract Address
						addr5.address 				// Node address
					)
				).to.be.reverted;
			});

			it ("Shouldn't create offers where the node address is a contract", async () => {
				await expect(
					resaleInstance.connect(addr3).createResaleOffer(
						1,
						resaleOfferPrice,
						rair721Instance.address,
						erc777instance.address 		// Smart contract
					)
				).to.be.revertedWith("Resale Marketplace: Node address cannot be a smart contract");
			});

			it ("Should create offers", async () => {
				await expect(
					await resaleInstance.connect(addr3).createResaleOffer(
						1,
						resaleOfferPrice,
						rair721Instance.address,
						addr5.address
					)
				)
					.to.emit(resaleInstance, "OfferStatusChange")
					.withArgs(
						addr3.address,
						rair721Instance.address,
						1,
						resaleOfferPrice,
						OfferStatus.OPEN,
						0
					);
			});

			it ("Shouldn't create an offer for a token that is already on sale", async () => {
				await expect(
					resaleInstance.connect(addr3).createResaleOffer(
						1,
						resaleOfferPrice,
						rair721Instance.address,
						addr5.address
					)
				)
					.to.be.revertedWith("Resale Marketplace: Token is already on sale");
			});

			it ("Shouldn't allow other addresses to cancel the sale", async () => {
				await expect(
					resaleInstance.connect(addr1).cancelOffer(0)
				).to.be.revertedWith("Resale Marketplace: Address does not own the token");
			});

			it ("Should allow NFT holders to cancel an offer", async () => {
				await expect(
					await resaleInstance.connect(addr3).cancelOffer(0)
				)
					.to.emit(resaleInstance, "OfferStatusChange")
					.withArgs(
						addr3.address,
						rair721Instance.address,
						1,
						resaleOfferPrice,
						OfferStatus.CANCELLED,
						0
					);

				// Make a new offer to keep testing
				await expect(
					await resaleInstance.connect(addr3).createResaleOffer(
						1,
						resaleOfferPrice,
						rair721Instance.address,
						addr5.address
					)
				)
					.to.emit(resaleInstance, "OfferStatusChange")
					.withArgs(
						addr3.address,
						rair721Instance.address,
						1,
						resaleOfferPrice,
						OfferStatus.OPEN,
						1
					);
			});

			it ("Should update an offer's price", async () => {
				await expect(
					await resaleInstance.connect(addr3).updateOffer(
						1,
						resaleOfferPrice * 2
					)
				)
					.to.emit(resaleInstance, "UpdatedOfferPrice")
					.withArgs(
						1,
						resaleOfferPrice,
						resaleOfferPrice * 2
					);
			});

			it ("Should pause the marketplace", async () => {
				await resaleInstance.pauseContract(true);
				await expect(await resaleInstance.paused()).to.equal(true);
			});

			it ("Shouldn't sell tokens if the marketplace is paused", async () => {
				await expect(
					resaleInstance
						.connect(addr4)
						.buyResaleOffer(1, {
							value: ethers.utils.parseEther("0.5")
						})
				).to.be.revertedWith("Resale Marketplace: Currently paused");
			});

			it ("Shouldn't create offers if the marketplace is paused", async () => {
				// Make a new offer to keep testing
				await expect(
					resaleInstance.connect(addr4).createResaleOffer(
						2,
						resaleOfferPrice,
						rair721Instance.address,
						addr5.address
					)
				).to.be.revertedWith("Resale Marketplace: Currently paused");
			});

			it ("Should unpause the marketplace", async () => {
				await resaleInstance.pauseContract(false);
				await expect(await resaleInstance.paused()).to.equal(false);
			});

			it ("Should increase precision decimals", async () => {
				await resaleInstance.updateFeeDecimals(5);
				await expect(await resaleInstance.feeDecimals()).to.equal(5);
				await expect(await resaleInstance.nodeFee()).to.equal(100000);
				await expect(await resaleInstance.treasuryFee()).to.equal(900000);
			})

			it ("Should sell a token", async () => {
				await expect(
					await resaleInstance
						.connect(addr4)
						.buyResaleOffer(1, {
							value: ethers.utils.parseEther("0.5")
						})
					)
						.to.emit(resaleInstance, "OfferStatusChange")
						.withArgs(
							addr4.address,
							rair721Instance.address,
							1,
							resaleOfferPrice * 2,
							OfferStatus.CLOSED,
							1
						)
						.to.changeEtherBalances(
							[owner, addr1, addr2, addr3, addr4, erc777instance, addr5],
							[
								(resaleOfferPrice * 2) * 0.30, 			// Owner gets 30%
								(resaleOfferPrice * 2) * 0.25, 			// Address 1 gets 25%
								(resaleOfferPrice * 2) * 0.25, 			// Address 2 gets 25%
								(resaleOfferPrice * 2) * 0.1, 			// Address 3 sold the token, gets 10%
								-(resaleOfferPrice * 2), 				// Address 4 buys the token
								(resaleOfferPrice * 2) * 0.09, 			// Treasury Address gets 9%
								(resaleOfferPrice * 2) * 0.01,			// Node Address (Address 5) gets 1%
							]
						)
			});

			it ("Shouldn't sell tokens in offers already closed", async () => {
				await expect(
					resaleInstance
						.connect(addr4)
						.buyResaleOffer(1, {
							value: ethers.utils.parseEther("0.5")
						})
				).to.be.revertedWith("Resale Marketplace: Offer is not available");
			});
		});
	});
})