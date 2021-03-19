#![cfg_attr(not(feature = "std"), no_std)]

pub use self::sub::Subcontract;
use ink_lang as ink;

#[ink::contract]
mod sub {
    #[ink(storage)]
    pub struct Subcontract {
        value: u32,
    }

    impl Subcontract {
        #[ink(constructor)]
        pub fn new(init_value: u32) -> Self {
            Self { value: init_value }
        }

        #[ink(message)]
        pub fn get(&self) -> u32 {
            self.value
        }
    }
}
