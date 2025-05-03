import asyncio
from mcp_agent.core.fastagent import FastAgent

fast = FastAgent("Critic")


@fast.agent(instruction="You are a critic agent.")
async def main():
    # use the --model command line switch or agent arguments to change model
    async with fast.run() as agent:
        await agent.interactive()


if __name__ == "__main__":
    asyncio.run(main())
