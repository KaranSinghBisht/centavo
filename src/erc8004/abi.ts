/**
 * ERC-8004 ABI fragments — transcribed verbatim from the verified implementation
 * contracts behind the Celo mainnet proxies (Blockscout verified source; full
 * ABIs archived in docs/erc8004-*.abi.json):
 *   IdentityRegistry   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 *   ReputationRegistry 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
 */
import { parseAbi } from "viem";

export const identityRegistryAbi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI)",
  "function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)",
]);

export const reputationRegistryAbi = parseAbi([
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "function getClients(uint256 agentId) view returns (address[])",
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
]);
