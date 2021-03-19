#![cfg_attr(not(feature = "std"), no_std)]

use ink_lang as ink;

#[ink::contract]
mod testing {
    use sub::Subcontract;
    use ink_env::call::FromAccountId;
    use ink_lang::ToAccountId;

    #[ink(storage)]
    pub struct Testing {
        from_constructor: AccountId,
        from_method: AccountId,
    }

    impl Testing {
        #[ink(constructor)]
        pub fn new(version: u32, code_hash: Hash) -> Self {
            let subcontract = Testing::internal_deploy(1111, version, code_hash);

            Self {
                from_constructor: ToAccountId::to_account_id(&subcontract),
                from_method: AccountId::default()
            }
        }

        fn internal_deploy(init_val: u32, version: u32, code_hash: Hash) -> Subcontract {
            let total_balance = Self::env().balance();
            let salt = version.to_le_bytes();

            Subcontract::new(init_val)
                .endowment(total_balance / 4)
                .code_hash(code_hash)
                // .gas_limit(1298863700000)
                .salt_bytes(salt)
                .instantiate()
                .expect("failed at instantiating the new `sub` contract")
        }

        #[ink(message)]
        pub fn deploy(&mut self, version: u32, code_hash: Hash) {
            let subcontract = Testing::internal_deploy(9999, version, code_hash);

            self.from_method = ToAccountId::to_account_id(&subcontract);
        }


        #[ink(message)]
        pub fn get_from_constructor(&self) -> u32 {
            let subcontract: Subcontract = FromAccountId::from_account_id(self.from_constructor);
            subcontract.get()
        }

        #[ink(message)]
        pub fn get_from_method(&self) -> u32 {
            let subcontract: Subcontract = FromAccountId::from_account_id(self.from_method);
            subcontract.get()
        }
    }
}
